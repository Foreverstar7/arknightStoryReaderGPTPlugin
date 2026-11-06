import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { parsePrtsCatalog } from '../src/data/prts-catalog.js';
import { parsePrtsChapter } from '../src/data/prts-script.js';
import { prtsPageUrl, readPrtsWiki } from '../src/data/prts-client.js';
import {
  CHARACTER_MAP,
  MAX_IMAGE_BYTES,
  parseImageIndex,
  safeImageUrl,
} from '../src/data/prts-resources.js';
import type { ResourceLayer } from '../src/data/prts-resources.js';
import { inspectImage } from '../src/data/image-format.js';
import { ReaderError } from '../src/shared/errors.js';
import {
  resolvePortraitPlan,
  normalizePortraitReference,
  STORY_VARIABLES,
  foldedMap,
  UnresolvedPortraitReference,
} from '../src/data/prts-portrait.js';
import { VERSION } from '../src/shared/version.js';

// Explicit public-source maintenance audit. Never opens a user store, fills the
// reader cache, downloads a full image corpus, or changes production behavior.
const root = path.resolve('.ai/local/body-image-audit');
const chapterRoot = path.resolve('.ai/local/prts-chapter-audit');
const online = process.argv.includes('--online');
const probe = process.argv.includes('--probe');
const refresh = process.argv.includes('--refresh');
const verifyRevisions = process.argv.includes('--verify-revisions');
if ((probe || refresh || verifyRevisions) && !online)
  throw new Error('--probe/--refresh/--verify-revisions require --online');
await mkdir(root, { recursive: true });
let requests = 0;
const sha256 = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');
const loadText = async (file: string) =>
  readFile(path.join(root, file), 'utf8');
const sources: {
  file: string;
  url: string;
  sha256: string;
  fetchedAt: string;
}[] = [];
async function source(
  file: string,
  url: string,
  fetchText: () => Promise<string>,
) {
  let text: string;
  try {
    if (refresh) throw new Error('refresh');
    text = await loadText(file);
  } catch {
    if (!online) throw new Error(`Missing public audit source: ${file}`);
    requests++;
    text = await fetchText();
    await writeFile(path.join(root, file), text);
  }
  sources.push({
    file,
    url,
    sha256: sha256(text),
    fetchedAt: (await stat(path.join(root, file))).mtime.toISOString(),
  });
  return text;
}
const wikiSource = (title: string) =>
  source(
    title.replaceAll(':', '_') + '.wiki',
    `${prtsPageUrl(title)}?action=raw`,
    () => readPrtsWiki(title),
  );
const catalog = parsePrtsCatalog(
  await wikiSource('剧情一览'),
  await wikiSource('模板:剧情导航'),
);
const imageMap = parseImageIndex(await wikiSource('Widget:Data_Image'));
const characters: unknown = JSON.parse(
  await source('character.json', CHARACTER_MAP, async () => {
    const response = await fetch(CHARACTER_MAP, {
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Character map HTTP ${response.status}`);
    return response.text();
  }),
);
const variables = foldedMap(
  JSON.parse(
    await source('story_variables.json', STORY_VARIABLES, async () => {
      const response = await fetch(STORY_VARIABLES);
      if (!response.ok) throw new Error('Variable source failed');
      return response.text();
    }),
  ),
);
const legacyLink = z
  .record(z.string(), z.unknown())
  .parse(JSON.parse(await wikiSource('Widget:Data_Link')));
const legacyImages = parseImageIndex(await wikiSource('Widget:Data_Char'));

type Use = {
  chapterId: string;
  blockId?: string;
  line?: number;
  command?: string;
};
type Asset = {
  kind: 'cg' | 'portrait' | 'background';
  reference: string;
  rawUses: Use[];
  readerUses: Use[];
  sceneUses: Use[];
  layers?: ResourceLayer[];
  code?: string;
  error?: string;
  cause?: string;
  diagnosticLayers?: ResourceLayer[];
  diagnosticNote?: string;
  resolution?: 'original' | 'default' | 'placeholder';
  resolutionReason?: string;
};
const assets = new Map<string, Asset>();
function asset(kind: Asset['kind'], reference: string): Asset {
  const key = `${kind}:${reference.toLowerCase()}`;
  let result = assets.get(key);
  if (!result) {
    result = { kind, reference, rawUses: [], readerUses: [], sceneUses: [] };
    assets.set(key, result);
  }
  return result;
}
type ChapterResult = {
  story: string;
  chapterId: string;
  title: string;
  sourceUrl: string;
  sha256?: string;
  sha1?: string;
  fetchedAt?: string;
  speech: number;
  cg: number;
  noScene: number;
  ambiguousScene: number;
  singleScene: number;
  rawCommands: Record<string, number>;
  error?: string;
};
const chapters: ChapterResult[] = [];
const unavailableSpeech: {
  reason: 'no_scene' | 'ambiguous_scene';
  chapterId: string;
  blockId: string;
  name: string;
  resources: string[];
}[] = [];
const unsupportedImageCommands: {
  chapterId: string;
  line: number;
  command: string;
  resources: string[];
}[] = [];
const scanFailures: { chapterId: string; line: number; text: string }[] = [];
const sourceCommandDiagnostics: {
  chapterId: string;
  line: number;
  command: string;
  message: string;
}[] = [];
// Independent lexical inventory, limited to resource-bearing commands. This is
// not a replacement script parser: production parsePrtsChapter supplies all UI
// paths and branch state. Line numbers below are raw Wiki line numbers.
function scan(wiki: string, chapterId: string, result: ChapterResult) {
  const templateStart = wiki.indexOf('{{剧情模拟器');
  const textStart = /\|?文本数据\s*=/u.exec(wiki.slice(templateStart));
  if (templateStart < 0 || !textStart) throw new Error('Missing script field');
  const offset = templateStart + textStart.index + textStart[0].length;
  const body = wiki.slice(offset).split(/^\}\}\s*$/mu)[0] ?? '';
  const firstLine = wiki.slice(0, offset).split('\n').length;
  for (const [index, text] of body.split(/\r?\n/u).entries()) {
    const line = index + firstLine;
    const command = /^\s*\[([a-z][\w]*)\s*\(/iu.exec(text)?.[1]?.toLowerCase();
    if (
      !command ||
      ![
        'character',
        'charslot',
        'charactercutin',
        'image',
        'imgeffect',
        'cgitem',
        'background',
        'gridbg',
        'verticalbg',
        'largebg',
        'largeimage',
        'largeimg',
        'avgdisplay',
      ].includes(command)
    )
      continue;
    result.rawCommands[command] = (result.rawCommands[command] ?? 0) + 1;
    const values: Record<string, string> = {};
    // Only complete quoted values or comma/closing-parenthesis delimited bare
    // values; repeated attributes use the source's last-assignment semantics.
    for (const match of text.matchAll(
      /(?:\(|,)\s*(\w+)\s*=\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^,)\]]*))/gu,
    )) {
      const key = match[1]?.toLowerCase();
      if (key)
        values[key] = (match[2] ?? match[3] ?? match[4]?.trim() ?? '').replace(
          /\\([\\"'])/gu,
          '$1',
        );
    }
    const portrait = ['character', 'charslot', 'charactercutin'].includes(
      command,
    );
    if (
      command === 'charslot' &&
      !values.slot &&
      values.name &&
      values.name.toLowerCase() !== 'char_empty'
    ) {
      sourceCommandDiagnostics.push({
        chapterId,
        line,
        command,
        message: `CharSlot has a name (${values.name}) but no slot; current parser clears the scene instead of loading a portrait.`,
      });
      continue;
    }
    const background =
      command === 'background' ||
      (['gridbg', 'verticalbg', 'largebg'].includes(command) &&
        Boolean(values.imagegroup)) ||
      (command === 'avgdisplay' && values.style === 'bg');
    const refs = portrait
      ? [values.name, ...(command === 'character' ? [values.name2] : [])]
      : command === 'avgdisplay'
        ? values.style === 'bg'
          ? [values.name]
          : []
        : [
            ...(values.image ? [values.image] : []),
            ...((values.imagegroup || values.cggroup)?.split('/') ?? []),
          ];
    const references = refs.filter(
      (value): value is string =>
        Boolean(value) && value?.toLowerCase() !== 'char_empty',
    );
    for (const reference of references)
      asset(
        portrait ? 'portrait' : background ? 'background' : 'cg',
        reference,
      ).rawUses.push({ chapterId, line, command });
    if (
      references.length &&
      !['character', 'charslot', 'image', 'imgeffect', 'cgitem'].includes(
        command,
      ) &&
      !(
        values.cggroup &&
        ['largebg', 'verticalbg'].includes(command) &&
        !values.imagegroup
      )
    )
      unsupportedImageCommands.push({
        chapterId,
        line,
        command,
        resources: references,
      });
    if (
      /\b(?:name2?|image|imagegroup|cggroup)\s*=/iu.test(text) &&
      !Object.keys(values).some((key) =>
        ['name', 'name2', 'image', 'imagegroup', 'cggroup'].includes(key),
      )
    )
      scanFailures.push({ chapterId, line, text });
  }
}

const entries = catalog.flatMap((story) =>
  story.chapters.map((chapter) => ({ story, chapter })),
);
for (const { story, chapter } of entries) {
  const pageTitle = chapter.id.slice(5);
  const result: ChapterResult = {
    story: story.title,
    chapterId: chapter.id,
    title: chapter.title,
    sourceUrl: prtsPageUrl(pageTitle),
    speech: 0,
    cg: 0,
    noScene: 0,
    ambiguousScene: 0,
    singleScene: 0,
    rawCommands: {},
  };
  try {
    const file = path.join(chapterRoot, `${sha256(pageTitle)}.wiki`);
    const wiki = await readFile(file, 'utf8');
    result.sha256 = sha256(wiki);
    result.sha1 = createHash('sha1').update(wiki).digest('hex');
    result.fetchedAt = (await stat(file)).mtime.toISOString();
    const parsed = parsePrtsChapter(wiki, {
      id: chapter.id,
      storyId: story.id,
      title: chapter.title,
      pageTitle,
      ...(['主线', '支线', '剧情'].includes(story.type)
        ? { group: story.title }
        : {}),
    });
    scan(wiki, chapter.id, result);
    for (const block of parsed.blocks) {
      const leaves =
        block.kind === 'choices'
          ? [
              ...block.options.flatMap((option) => option.blocks),
              ...(block.shared?.flatMap((group) => group.blocks) ?? []),
            ]
          : [block];
      for (const leaf of leaves) {
        const use = { chapterId: chapter.id, blockId: leaf.id };
        if (leaf.kind === 'cg') {
          result.cg++;
          if (leaf.resource)
            for (const reference of leaf.resource.split('/'))
              asset('cg', reference).readerUses.push(use);
          else throw new Error('CG block has no reference');
        }
        if (leaf.kind !== 'speech') continue;
        result.speech++;
        const resources = [
          ...new Set(leaf.scene?.slots.map((slot) => slot.resource) ?? []),
        ];
        for (const reference of resources)
          asset('portrait', reference).sceneUses.push(use);
        const normalizedResources = new Set(
          resources.map(normalizePortraitReference),
        );
        const reference = resources[0];
        if (
          normalizedResources.size === 1 &&
          reference &&
          normalizePortraitReference(reference)
        ) {
          result.singleScene++;
          asset('portrait', reference).readerUses.push(use);
        } else {
          if (resources.length) result.ambiguousScene++;
          else result.noScene++;
          unavailableSpeech.push({
            ...use,
            reason: resources.length ? 'ambiguous_scene' : 'no_scene',
            name: leaf.name,
            resources,
          });
        }
      }
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  chapters.push(result);
}
const revisionSchema = z.object({
  chapterId: z.string(),
  localSha1: z.string(),
  identical: z.boolean(),
  checkedAt: z.string(),
  revision: z
    .object({
      revid: z.number(),
      parentid: z.number(),
      timestamp: z.string(),
      sha1: z.string(),
    })
    .optional(),
});
let revisionChecks: z.infer<typeof revisionSchema>[] = [];
if (verifyRevisions) {
  const apiSchema = z.object({
    query: z.object({
      normalized: z
        .array(z.object({ from: z.string(), to: z.string() }))
        .optional(),
      pages: z.array(
        z.object({
          title: z.string(),
          revisions: z.array(revisionSchema.shape.revision.unwrap()).optional(),
        }),
      ),
    }),
  });
  for (let offset = 0; offset < chapters.length; offset += 50) {
    const batch = chapters.slice(offset, offset + 50);
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'revisions',
      rvprop: 'sha1|timestamp|ids',
      titles: batch
        .map((chapter) => chapter.chapterId.slice(5).replaceAll('_', ' '))
        .join('|'),
    });
    requests++;
    const response = await fetch(`https://prts.wiki/api.php?${params}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(`Revision metadata HTTP ${response.status}`);
    const data = apiSchema.parse(await response.json());
    const normalized = new Map(
      data.query.normalized?.map((item) => [item.from, item.to]),
    );
    for (const chapter of batch) {
      const title = chapter.chapterId.slice(5).replaceAll('_', ' ');
      const revision = data.query.pages.find(
        (page) => page.title === (normalized.get(title) ?? title),
      )?.revisions?.[0];
      const localSha1 = chapter.sha1 ?? '';
      const identical =
        Boolean(localSha1) &&
        (revision?.sha1 === localSha1 ||
          revision?.sha1 ===
            BigInt(`0x${localSha1}`).toString(36).padStart(31, '0'));
      revisionChecks.push({
        chapterId: chapter.chapterId,
        localSha1,
        revision,
        identical,
        checkedAt: new Date().toISOString(),
      });
    }
  }
  await writeFile(
    path.join(root, 'revision-verification.json'),
    JSON.stringify(revisionChecks, null, 2),
  );
} else {
  try {
    revisionChecks = z
      .array(revisionSchema)
      .parse(JSON.parse(await loadText('revision-verification.json')));
  } catch {
    /* Offline evidence can be absent; reported explicitly below. */
  }
}
const currentRevisionChecks = new Map(
  revisionChecks.map((check) => [check.chapterId, check]),
);
const verifiedChapters = chapters.filter((chapter) => {
  const check = currentRevisionChecks.get(chapter.chapterId);
  return check?.identical && check.localSha1 === chapter.sha1;
});
if (verifyRevisions && verifiedChapters.length !== chapters.length)
  throw new Error(
    'Source revisions differ or are unavailable. Refresh the chapter audit samples before asserting current coverage.',
  );
for (const entry of assets.values()) {
  try {
    if (entry.kind === 'portrait') {
      let reference = normalizePortraitReference(entry.reference);
      if (reference.startsWith('$')) {
        const value = variables[reference.slice(1)];
        reference =
          typeof value === 'string' && !value.startsWith('$')
            ? value
            : reference;
      }
      const plan = resolvePortraitPlan(characters, reference, {
        link: legacyLink,
        images: legacyImages,
      });
      entry.layers = plan?.layers;
      entry.resolution = plan?.portrait.status ?? 'placeholder';
      entry.resolutionReason = plan?.portrait.reason ?? 'unconfirmed_resource';
    } else if (entry.kind === 'background') {
      // Diagnostic-only source rule, verified in the current PRTS StoryPlayer
      // context module (2026-11-04); Widget:Data_Image indexes CG, not backgrounds.
      // The module explicitly maps background keys to this directory. Recheck
      // its URL builder if the player changes; never feed this into the reader.
      const key = entry.reference.trim().toLowerCase();
      if (!/^[a-z0-9_.-]+$/u.test(key))
        throw new ReaderError(
          'unsupported',
          'Background key outside verified source rule',
        );
      entry.layers = [
        {
          url: `https://torappu.prts.wiki/assets/avg/background/${key}.png`,
          x: 0,
          y: 0,
        },
      ];
    } else {
      const url = imageMap.get(entry.reference.toLowerCase());
      if (!url)
        throw new ReaderError('resource_missing', 'PRTS 图片索引没有资源');
      entry.layers = [{ url, x: 0, y: 0 }];
      entry.resolution = 'original';
    }
  } catch (error) {
    entry.code = error instanceof ReaderError ? error.code : 'unknown';
    entry.error = error instanceof Error ? error.message : String(error);
    if (entry.kind !== 'portrait') continue;
    if (error instanceof UnresolvedPortraitReference) {
      entry.resolution = 'placeholder';
      entry.resolutionReason = 'unsupported_reference';
      delete entry.error;
      delete entry.code;
    }
  }
}
console.log(
  JSON.stringify({
    phase: 'inventory',
    chapters: chapters.length,
    chapterErrors: chapters.filter((x) => x.error).length,
    assets: assets.size,
    mappingFailures: [...assets.values()].filter((x) => x.error).length,
  }),
);

type Probe = {
  url: string;
  checkedAt: string;
  status?: number;
  mime?: string;
  bytes?: number;
  width?: number;
  height?: number;
  code?: string;
  error?: string;
  attempts: number;
};
const probeSchema = z.object({
  url: z.string(),
  checkedAt: z.string(),
  status: z.number().optional(),
  mime: z.string().optional(),
  bytes: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  code: z.string().optional(),
  error: z.string().optional(),
  attempts: z.number(),
});
const probes = new Map<string, Probe>();
try {
  for (const item of z
    .array(probeSchema)
    .parse(JSON.parse(await loadText('probes.json'))))
    probes.set(item.url, item);
} catch {
  /* A first run has no saved checks. */
}
async function checkUrl(url: string): Promise<Probe> {
  if (!safeImageUrl(url))
    return {
      url,
      checkedAt: new Date().toISOString(),
      attempts: 0,
      code: 'unsafe_url',
      error: 'Unverified image host',
    };
  // Range fetch verifies current access and actual raster header while avoiding
  // full image downloads. The reader's size/MIME rules apply; full decode is a
  // separate boundary, explicitly not asserted by this report.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result: Probe = {
      url,
      checkedAt: new Date().toISOString(),
      attempts: attempt,
    };
    try {
      requests++;
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        headers: { Range: 'bytes=0-65535' },
      });
      result.status = response.status;
      result.mime = response.headers.get('content-type') ?? '';
      const total =
        /\/(\d+)$/u.exec(response.headers.get('content-range') ?? '')?.[1] ??
        response.headers.get('content-length');
      if (total) result.bytes = Number(total);
      if (![200, 206].includes(response.status)) {
        await response.body?.cancel();
        throw new ReaderError(
          response.status === 404 ? 'resource_missing' : 'network',
          `HTTP ${response.status}`,
        );
      }
      if (result.bytes !== undefined && result.bytes > MAX_IMAGE_BYTES) {
        await response.body?.cancel();
        throw new ReaderError('parse', 'Image exceeds current 20 MB budget');
      }
      if (!response.body) throw new ReaderError('network', 'No response body');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (length < 65536) {
          const chunk = await reader.read();
          if (chunk.done) break;
          chunks.push(chunk.value.subarray(0, 65536 - length));
          length += chunks.at(-1)?.length ?? 0;
        }
      } finally {
        await reader.cancel();
      }
      const info = inspectImage(Buffer.concat(chunks), result.mime, url);
      result.width = info.width;
      result.height = info.height;
      return result;
    } catch (error) {
      result.code = error instanceof ReaderError ? error.code : 'network';
      result.error = error instanceof Error ? error.message : String(error);
      if (result.code !== 'network' || attempt === 3) return result;
    }
  }
  throw new Error('Unreachable retry');
}
const urls = [
  ...new Set(
    [...assets.values()].flatMap((entry) =>
      [...(entry.layers ?? []), ...(entry.diagnosticLayers ?? [])].map(
        (layer) => layer.url,
      ),
    ),
  ),
];
const activeUrls = new Set(urls);
if (probe) {
  let cursor = 0,
    done = 0;
  async function worker() {
    for (;;) {
      const url = urls[cursor++];
      if (!url) return;
      if (!refresh && probes.has(url) && !probes.get(url)?.error) {
        done++;
        continue;
      }
      probes.set(url, await checkUrl(url));
      done++;
      if (done % 100 === 0 || done === urls.length) {
        await writeFile(
          path.join(root, 'probes.json'),
          JSON.stringify([...probes.values()], null, 2),
        );
        console.log(
          JSON.stringify({
            phase: 'probe',
            done,
            total: urls.length,
            failed: [...probes.values()].filter((x) => x.error).length,
            requests,
          }),
        );
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  await writeFile(
    path.join(root, 'probes.json'),
    JSON.stringify([...probes.values()], null, 2),
  );
}
const count = (
  items: Asset[],
  uses: 'rawUses' | 'readerUses' | 'sceneUses',
) => ({
  unique: items.length,
  occurrences: items.reduce((sum, item) => sum + item[uses].length, 0),
  chapters: new Set(
    items.flatMap((item) => item[uses].map((use) => use.chapterId)),
  ).size,
});
const totals = (
  kind: Asset['kind'],
  uses: 'rawUses' | 'readerUses' | 'sceneUses',
) => {
  const items = [...assets.values()].filter(
    (x) => x.kind === kind && x[uses].length,
  );
  const failures = items.filter((x) => x.error);
  const unreachable = items.filter(
    (x) => !x.error && x.layers?.some((layer) => probes.get(layer.url)?.error),
  );
  const unchecked = items.filter(
    (x) => !x.error && x.layers?.some((layer) => !probes.has(layer.url)),
  );
  return {
    total: count(items, uses),
    original: count(
      items.filter((x) => x.resolution === 'original'),
      uses,
    ),
    default: count(
      items.filter((x) => x.resolution === 'default'),
      uses,
    ),
    placeholder: count(
      items.filter((x) => x.resolution === 'placeholder'),
      uses,
    ),
    mappingFailed: count(failures, uses),
    httpFailed: count(unreachable, uses),
    unchecked: count(unchecked, uses),
  };
};
const report = {
  version: VERSION,
  checkedAt: new Date().toISOString(),
  online,
  probe,
  publicRequests: requests,
  verification:
    'Source mapping and HTTP range / MIME / raster dimensions. Does not assert full image decode or host UI. Portrait readerUses covers single-resource scenes only; identity matching is not performed, so unresolved scenes are not confirmed placeholders.',
  sources,
  revisionVerification: {
    verified: verifiedChapters.length,
    total: chapters.length,
    earliestCheck: revisionChecks.map((check) => check.checkedAt).sort()[0],
    latestCheck: revisionChecks
      .map((check) => check.checkedAt)
      .sort()
      .at(-1),
  },
  probeCoverage: {
    required: urls.length,
    checked: urls.filter((url) => probes.has(url)).length,
    failed: urls.filter((url) => probes.get(url)?.error).length,
    unchecked: urls.filter((url) => !probes.has(url)).length,
  },
  summary: {
    stories: catalog.length,
    chapters: chapters.length,
    chapterErrors: chapters.filter((x) => x.error).length,
    scanFailures: scanFailures.length,
    cg: totals('cg', 'readerUses'),
    portrait: totals('portrait', 'readerUses'),
    rawCg: totals('cg', 'rawUses'),
    rawPortrait: totals('portrait', 'rawUses'),
    rawBackground: totals('background', 'rawUses'),
    scenePortrait: totals('portrait', 'sceneUses'),
    speech: {
      total: chapters.reduce((n, x) => n + x.speech, 0),
      singleScene: chapters.reduce((n, x) => n + x.singleScene, 0),
      noScene: chapters.reduce((n, x) => n + x.noScene, 0),
      ambiguousScene: chapters.reduce((n, x) => n + x.ambiguousScene, 0),
      identityLookupPerformed: false,
      unresolvedBeforeIdentityMatch: chapters.reduce(
        (n, x) => n + x.noScene + x.ambiguousScene,
        0,
      ),
    },
  },
  chapters,
  assets: [...assets.values()],
  unavailableSpeech,
  unsupportedImageCommands,
  scanFailures,
  sourceCommandDiagnostics,
  probes: [...probes.values()].filter((probe) => activeUrls.has(probe.url)),
};
await writeFile(
  path.join(root, 'report-fixed.json'),
  JSON.stringify(report, null, 2),
);
// Keep reruns local. Export reviewed summaries separately; never overwrite a
// versioned report in docs/ with results from a newer parser or source snapshot.
const summaryFile = path.join(root, 'report-summary.json');
await writeFile(
  summaryFile,
  JSON.stringify(
    {
      version: report.version,
      checkedAt: report.checkedAt,
      verification: report.verification,
      sources: report.sources,
      revisionVerification: report.revisionVerification,
      probeCoverage: report.probeCoverage,
      summary: report.summary,
      chapters: report.chapters,
      resolutions: report.assets
        .filter((x) => x.kind === 'portrait')
        .map(
          ({
            reference,
            resolution,
            resolutionReason,
            code,
            error,
            rawUses,
            readerUses,
          }) => ({
            reference,
            resolution,
            resolutionReason,
            code,
            error,
            rawOccurrences: rawUses.length,
            readerOccurrences: readerUses.length,
          }),
        ),
      unsupportedImageCommands: report.unsupportedImageCommands,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    file: path.join(root, 'report-fixed.json'),
    summaryFile,
    ...report.summary,
    requests,
  }),
);
if (
  report.summary.chapterErrors ||
  report.summary.scanFailures ||
  [...assets.values()].some((asset) => asset.error)
)
  process.exitCode = 1;
