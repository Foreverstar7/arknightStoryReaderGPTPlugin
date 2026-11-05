import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import type { Chapter, ReaderImage } from '../src/shared/contracts.js';
import {
  chapterFingerprint,
  compareFingerprints,
  fingerprint,
  sha256,
  sourceWordCensus,
} from './refactoring-fingerprint.js';

// Explicit offline maintenance only. Code, public samples and the output are
// explicit inputs; this script never opens the installed reader or reading/.
const { values } = parseArgs({
  options: {
    'code-root': { type: 'string', default: '.' },
    samples: { type: 'string', default: '.ai/local' },
    output: { type: 'string' },
    compare: { type: 'string' },
  },
});
if (!values.output) throw new Error('Supply --output <local report.json>');
const codeRoot = path.resolve(values['code-root']);
const samples = path.resolve(values.samples);
const output = path.resolve(values.output);
if (values.compare && path.resolve(values.compare) === output)
  throw new Error('The comparison output must not overwrite its baseline');
await mkdir(path.dirname(output), { recursive: true });
const scratch = await mkdtemp(path.join(path.dirname(output), 'replay-'));
let networkAttempts = 0;
globalThis.fetch = async () => {
  networkAttempts++;
  throw new Error('Network forbidden by the offline refactoring baseline');
};
const moduleUrl = (file: string) =>
  pathToFileURL(path.join(codeRoot, 'dist', file)).href;
const catalogModule: typeof import('../src/data/prts-catalog.js') =
  await import(moduleUrl('data/prts-catalog.js'));
const scriptModule: typeof import('../src/data/prts-script.js') = await import(
  moduleUrl('data/prts-script.js')
);
const reading: typeof import('../src/domain/reading.js') = await import(
  moduleUrl('domain/reading.js')
);
const resourcesModule: typeof import('../src/data/prts-resources.js') =
  await import(moduleUrl('data/prts-resources.js'));
const portrait: typeof import('../src/data/prts-portrait.js') = await import(
  moduleUrl('data/prts-portrait.js')
);
const metadata: typeof import('../src/data/prts-metadata.js') = await import(
  moduleUrl('data/prts-metadata.js')
);
const client: typeof import('../src/data/prts-client.js') = await import(
  moduleUrl('data/prts-client.js')
);
const cache: typeof import('../src/storage/cache-coordinator.js') =
  await import(moduleUrl('storage/cache-coordinator.js'));
const { VERSION }: typeof import('../src/shared/version.js') = await import(
  moduleUrl('shared/version.js')
);
const inputs: Record<string, string> = {};
const observations: Record<string, string> = {};
function imageMetadata(image: ReaderImage) {
  return {
    ...image,
    layers: image.layers.map(({ dataUrl, ...layer }) => ({
      ...layer,
      dataUrlSha256: sha256(dataUrl),
    })),
  };
}
const images: Record<string, ReturnType<typeof imageMetadata>> = {};
const identities: {
  chapterId: string;
  blockId: string;
  name: string;
  id: string;
  references: string[];
  selected: string | null;
  evidence: string;
}[] = [];
const failures: { key: string; message: string }[] = [];
const sourceTailFindings: { chapterId: string; lines: number[] }[] = [];
const noteFailure = (key: string, error: unknown) => {
  failures.push({
    key,
    message: error instanceof Error ? error.message : String(error),
  });
};
async function source(file: string) {
  const text = await readFile(path.join(samples, file), 'utf8');
  inputs[file] = sha256(text);
  return text;
}
const leaves = (chapter: Chapter) =>
  chapter.blocks.flatMap((block) =>
    block.kind === 'choices'
      ? [
          ...block.options.flatMap((option) => option.blocks),
          ...(block.shared?.flatMap((group) => group.blocks) ?? []),
        ]
      : [block],
  );
async function fileHashes(directory: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(path.join(codeRoot, directory), {
    withFileTypes: true,
  })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(result, await fileHashes(file));
    else if (entry.isFile())
      result[file] = sha256(await readFile(path.join(codeRoot, file)));
  }
  return result;
}
const counts = {
  stories: 0,
  chapters: 0,
  parsed: 0,
  wordChecks: 0,
  text: 0,
  mixed: 0,
  video: 0,
  portraits: 0,
  cg: 0,
  compositions: 0,
  identity: 0,
  rasters: 0,
  rasterBytes: 0,
};
let replayedRequests = 0;
let sourceDb: DatabaseSync | undefined;
try {
  const catalog = catalogModule.parsePrtsCatalog(
    await source('body-image-audit/剧情一览.wiki'),
    await source('body-image-audit/模板_剧情导航.wiki'),
  );
  counts.stories = catalog.length;
  counts.chapters = catalog.reduce(
    (sum, story) => sum + story.chapters.length,
    0,
  );
  observations.catalog = fingerprint(catalog);
  const imageAudit = z
    .object({
      failures: z.array(z.object({ reference: z.string() })),
      cgOmissions: z.object({
        occurrenceList: z.array(
          z.object({ chapterId: z.string(), reference: z.string() }),
        ),
      }),
    })
    .parse(
      JSON.parse(
        await readFile('docs/prts-image-audit-2026-11-04.json', 'utf8'),
      ),
    );
  inputs['image-sample-selection'] = fingerprint(imageAudit);
  const compositeChapters = new Set(
    imageAudit.cgOmissions.occurrenceList.map((item) => item.chapterId),
  );
  const composites: {
    key: string;
    block: Extract<Chapter['blocks'][number], { kind: 'cg' }>;
  }[] = [];
  const identityChapters: Chapter[] = [];
  for (const story of catalog)
    for (const chapter of story.chapters) {
      try {
        const pageTitle = chapter.id.slice('prts:'.length);
        const wiki = await source(
          `prts-chapter-audit/${sha256(pageTitle)}.wiki`,
        );
        const parsed = scriptModule.parsePrtsChapter(wiki, {
          id: chapter.id,
          storyId: story.id,
          title: chapter.title,
          pageTitle,
          ...(['主线', '支线', '剧情'].includes(story.type)
            ? { group: story.title }
            : {}),
        });
        const words = reading.chapterWords(parsed);
        observations[`chapter:${chapter.id}`] = chapterFingerprint(
          parsed,
          words,
        );
        counts.parsed++;
        counts[reading.chapterContentKind(parsed)]++;
        const census = sourceWordCensus(wiki);
        observations[`census:${chapter.id}`] = fingerprint(census);
        if (census.unclassified.length)
          sourceTailFindings.push({
            chapterId: chapter.id,
            lines: census.unclassified,
          });
        if (census.words !== words)
          noteFailure(
            `words:${chapter.id}`,
            `source=${census.words}, parsed=${words}, unclassified=${census.unclassified.join(',')}`,
          );
        else counts.wordChecks++;
        if (compositeChapters.has(chapter.id))
          for (const block of leaves(parsed))
            if (block.kind === 'cg' && block.composition)
              composites.push({ key: `${chapter.id}:${block.id}`, block });
        // Bounded identity sample from the existing 0.1.23 acceptance path.
        // It is deliberately separate from whole-corpus pre-identity statistics.
        if (chapter.id === 'prts:4-1 免费拥抱/BEG')
          identityChapters.push(parsed);
      } catch (error) {
        noteFailure(chapter.id, error);
      }
    }
  console.info(
    JSON.stringify({ phase: 'chapters', ...counts, failures: failures.length }),
  );

  const textSources = new Map<string, string>();
  for (const [title, file] of [
    ['Widget:Data_Image', 'Widget_Data_Image.wiki'],
    ['Widget:Data_Char', 'Widget_Data_Char.wiki'],
    ['Widget:Data_Link', 'Widget_Data_Link.wiki'],
  ]) {
    if (title && file)
      textSources.set(title, await source(`body-image-audit/${file}`));
  }
  const jsonSources = new Map([
    [portrait.CHARACTER_MAP, await source('body-image-audit/character.json')],
    [
      portrait.STORY_VARIABLES,
      await source('body-image-audit/story_variables.json'),
    ],
  ]);
  sourceDb = new DatabaseSync(
    path.join(
      samples,
      'image-fixes-0.1.22/image-probe-cache/cache/content.sqlite',
    ),
    { readOnly: true },
  );
  const rasterRow = sourceDb.prepare(
    "SELECT value FROM entries WHERE scope = 'images' AND key = ?",
  );
  const rasterSchema = z.object({
    dataUrl: z
      .string()
      .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/u),
  });
  const observedRasters = new Set<string>();
  const request: typeof fetch = async (input) => {
    const url = String(input);
    replayedRequests++;
    const json = jsonSources.get(url);
    if (json !== undefined)
      return new Response(json, {
        headers: { 'content-type': 'application/json' },
      });
    const row = rasterRow.get(sha256(url));
    if (typeof row?.value !== 'string')
      throw new Error(`Missing offline raster: ${url}`);
    const { dataUrl } = rasterSchema.parse(JSON.parse(row.value));
    const separator = dataUrl.indexOf(',');
    const bytes = Buffer.from(dataUrl.slice(separator + 1), 'base64');
    inputs[`raster:${url}`] = sha256(bytes);
    if (!observedRasters.has(url)) {
      counts.rasters++;
      counts.rasterBytes += bytes.length;
      observedRasters.add(url);
    }
    return new Response(new Uint8Array(bytes), {
      headers: { 'content-type': dataUrl.slice(5, dataUrl.indexOf(';')) },
    });
  };
  const resources = new resourcesModule.PrtsResources(
    scratch,
    async (title) => {
      const text = textSources.get(title);
      if (text === undefined)
        throw new Error(`Missing offline Wiki sample: ${title}`);
      return text;
    },
    request,
  );
  const recordImage = (key: string, image: ReaderImage) => {
    const value = imageMetadata(image);
    observations[key] = fingerprint(value);
    images[key] = value;
  };
  for (const { reference } of imageAudit.failures) {
    try {
      recordImage(
        `portrait:${reference}`,
        await resources.portrait(reference, 7),
      );
      counts.portraits++;
    } catch (error) {
      noteFailure(`portrait:${reference}`, error);
    }
  }
  for (const reference of new Set(
    imageAudit.cgOmissions.occurrenceList.map((item) => item.reference),
  )) {
    try {
      recordImage(`cg:${reference}`, await resources.cg(reference, 7));
      counts.cg++;
    } catch (error) {
      noteFailure(`cg:${reference}`, error);
    }
  }
  for (const { key, block } of composites) {
    try {
      if (!block.resource)
        throw new Error('Composite sample lacks a resource reference');
      recordImage(
        `composition:${key}`,
        await resources.cg(block.resource, 7, false, block.composition),
      );
      counts.compositions++;
    } catch (error) {
      noteFailure(`composition:${key}`, error);
    }
  }
  for (const name of ['阿米娅', '凯尔希']) {
    const wiki = await source(
      `worktree-evidence-portrait-identity-20261104/portrait-identity/${name}.wiki`,
    );
    const id = metadata.parseOperatorIdentity(
      wiki,
      name,
      client.prtsPageUrl(name),
    );
    if (!id) throw new Error(`Identity missing for frozen sample ${name}`);
    for (const chapter of identityChapters)
      for (const block of leaves(chapter)) {
        if (
          block.kind !== 'speech' ||
          block.name !== name ||
          !block.scene ||
          block.scene.slots.length < 2
        )
          continue;
        const references = block.scene.slots.map((slot) => slot.resource);
        const selected = portrait.matchSpeakerPortrait(references, id);
        identities.push({
          chapterId: chapter.id,
          blockId: block.id,
          name,
          id,
          references,
          selected,
          evidence: client.prtsPageUrl(name),
        });
        observations[`identity:${chapter.id}:${block.id}`] = fingerprint({
          name,
          id,
          references,
          selected,
          evidence: sha256(wiki),
        });
        counts.identity++;
      }
  }
  if (!counts.identity)
    noteFailure('identity', 'No matching real identity samples');
  // Original synthetic inputs freeze default/placeholder semantics independently
  // of the real corpus, which currently has no proven default-only selection.
  const modern = {
    original: {
      array: [
        {
          name: 'normal',
          body: 0,
          index: 0,
          group: -1,
          image: 'original/normal',
        },
      ],
    },
  };
  observations['fixture:default'] = fingerprint(
    portrait.resolvePortraitPlan(modern, 'original#99', {
      link: {},
      images: new Map(),
    }),
  );
  observations['fixture:placeholder'] = fingerprint(
    portrait.placeholderPortrait(
      'original',
      'unconfirmed_resource',
      '原创占位',
      [],
    ),
  );
} catch (error) {
  noteFailure('setup', error);
} finally {
  sourceDb?.close();
  new cache.CacheCoordinator(scratch).close();
  await rm(scratch, { recursive: true, force: true });
}
const comparisonSchema = z.object({
  format: z.literal(1),
  inputs: z.record(z.string(), z.string()),
  observations: z.record(z.string(), z.string()),
  failures: z.array(z.unknown()),
  networkAttempts: z.literal(0),
});
let differences: { inputs: string[]; observations: string[] } | undefined;
if (values.compare) {
  const previous = comparisonSchema.parse(
    JSON.parse(await readFile(values.compare, 'utf8')),
  );
  if (previous.failures.length)
    throw new Error('Cannot compare against an incomplete baseline');
  differences = {
    inputs: compareFingerprints(previous.inputs, inputs),
    observations: compareFingerprints(previous.observations, observations),
  };
}
const report = {
  format: 1,
  version: VERSION,
  codeRoot,
  checkedAt: new Date().toISOString(),
  sources: await fileHashes('src'),
  build: await fileHashes('dist'),
  tests: await fileHashes('tests'),
  audit: {
    runner: sha256(await readFile(new URL(import.meta.url))),
    fingerprint: sha256(
      await readFile(new URL('./refactoring-fingerprint.ts', import.meta.url)),
    ),
  },
  inputs,
  observations,
  images,
  identities,
  counts,
  sourceTailFindings,
  failures,
  networkAttempts,
  replayedRequests,
  differences,
};
await writeFile(output, JSON.stringify(report, null, 2));
console.info(
  JSON.stringify({
    output,
    counts,
    failures,
    networkAttempts,
    replayedRequests,
    differences,
  }),
);
if (
  failures.length ||
  networkAttempts ||
  differences?.inputs.length ||
  differences?.observations.length
)
  process.exitCode = 1;
