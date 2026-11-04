import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { z } from 'zod';
import { PrtsResources } from '../src/data/prts-resources.js';
import { readPrtsWiki } from '../src/data/prts-client.js';
import { parsePrtsChapter } from '../src/data/prts-script.js';
import {
  imageResultSchema,
  type ReaderImage,
} from '../src/shared/contracts.js';
import { CacheCoordinator } from '../src/storage/cache-coordinator.js';

// Explicit bounded maintenance probe: only the 169 failed portraits and 122
// omitted CGs in the preserved audit baseline. No reading store is opened.
const baseline = z
  .object({
    failures: z.array(z.object({ reference: z.string(), cause: z.string() })),
    cgOmissions: z.object({
      occurrenceList: z.array(
        z.object({ chapterId: z.string(), reference: z.string() }),
      ),
    }),
  })
  .parse(
    JSON.parse(await readFile('docs/prts-image-audit-2026-11-04.json', 'utf8')),
  );
const root = path.resolve('.ai/local/image-fixes-0.1.22');
await mkdir(root, { recursive: true });
const cacheRoot = path.join(root, 'image-probe-cache');
const requests: { url: string; status: number }[] = [];
const request: typeof fetch = async (input, init) => {
  if (process.argv.includes('--offline'))
    throw new Error('Explicit offline replay');
  const response = await fetch(input, init);
  requests.push({ url: String(input), status: response.status });
  return response;
};
const resources = new PrtsResources(
  cacheRoot,
  (title) => readPrtsWiki(title, request),
  request,
);
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? 'msedge',
});
const page = await browser.newPage();
const decoded = new Map<
  string,
  {
    url: string;
    width: number;
    height: number;
    bytes: number;
    sha256: string;
    transparent: boolean;
    visible: boolean;
  }
>();
const portraits: {
  reference: string;
  cause: string;
  status: string | undefined;
  layers: number;
}[] = [];
const compositions: {
  chapterId: string;
  blockId: string;
  resource: string | undefined;
  width: number;
  height: number;
  layers: number;
  visiblePixels: number;
}[] = [];
const samples: { key: string; image: ReaderImage }[] = [];
async function decode(image: ReaderImage) {
  for (const layer of image.layers) {
    if (decoded.has(layer.sourceUrl)) continue;
    const result = await page.evaluate(async (dataUrl) => {
      const element = new Image();
      element.src = dataUrl;
      await element.decode();
      const canvas = document.createElement('canvas');
      canvas.width = element.width;
      canvas.height = element.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No canvas');
      context.drawImage(element, 0, 0);
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let transparent = false;
      let visible = false;
      for (let i = 3; i < pixels.length; i += 4) {
        transparent ||= (pixels[i] ?? 255) < 255;
        visible ||= (pixels[i] ?? 0) > 0;
      }
      return {
        width: element.width,
        height: element.height,
        transparent,
        visible,
      };
    }, layer.dataUrl);
    const bytes = Buffer.from(layer.dataUrl.split(',')[1] ?? '', 'base64');
    decoded.set(layer.sourceUrl, {
      url: layer.sourceUrl,
      ...result,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    assert.ok(result.width > 0 && result.height > 0 && result.visible);
  }
}
try {
  for (const [index, failure] of baseline.failures.entries()) {
    const image = imageResultSchema.parse(
      await resources.portrait(failure.reference, 7),
    );
    assert.equal(image.portrait?.status, 'original');
    await decode(image);
    portraits.push({
      ...failure,
      status: image.portrait?.status,
      layers: image.layers.length,
    });
    if (!samples.some((sample) => sample.key === failure.cause))
      samples.push({ key: failure.cause, image });
    if ((index + 1) % 40 === 0)
      console.log(
        JSON.stringify({
          phase: 'portraits',
          completed: index + 1,
          total: baseline.failures.length,
        }),
      );
  }
  // Every omitted reference is decoded, even if a later static fade hides it.
  for (const reference of new Set(
    baseline.cgOmissions.occurrenceList.map((item) => item.reference),
  ))
    await decode(await resources.cg(reference, 7));
  for (const chapterId of new Set(
    baseline.cgOmissions.occurrenceList.map((item) => item.chapterId),
  )) {
    const pageTitle = chapterId.slice(5);
    const wiki = await readFile(
      path.join(
        '.ai/local/prts-chapter-audit',
        `${createHash('sha256').update(pageTitle).digest('hex')}.wiki`,
      ),
      'utf8',
    );
    const chapter = parsePrtsChapter(wiki, {
      id: chapterId,
      storyId: 'audit',
      title: pageTitle,
      pageTitle,
    });
    const leaves = chapter.blocks.flatMap((block) =>
      block.kind === 'choices'
        ? [
            ...block.options.flatMap((option) => option.blocks),
            ...(block.shared?.flatMap((group) => group.blocks) ?? []),
          ]
        : [block],
    );
    for (const block of leaves) {
      if (block.kind !== 'cg' || !block.composition || !block.resource)
        continue;
      const image = imageResultSchema.parse(
        await resources.cg(block.resource, 7, false, block.composition),
      );
      await decode(image);
      // Decode the exact SVG layout used by ImageLayers, then inspect the entire
      // composed canvas. Every source tile is also independently decoded above.
      const visiblePixels = await page.evaluate(async (image) => {
        const layers = image.layers
          .map(
            (layer) =>
              `<image href="${layer.dataUrl}" x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" preserveAspectRatio="none" opacity="${layer.opacity ?? 1}" transform="rotate(${layer.rotation ?? 0} ${layer.x + layer.width / 2} ${layer.y + layer.height / 2})"/>`,
          )
          .join('');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${image.width}" height="${image.height}" viewBox="0 0 ${image.width} ${image.height}">${layers}</svg>`;
        const element = new Image();
        element.src = URL.createObjectURL(
          new Blob([svg], { type: 'image/svg+xml' }),
        );
        await element.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('No canvas');
        context.drawImage(element, 0, 0);
        URL.revokeObjectURL(element.src);
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        let visible = 0;
        for (let i = 3; i < pixels.length; i += 4)
          if ((pixels[i] ?? 0) > 0) visible++;
        return visible;
      }, image);
      assert.ok(
        visiblePixels > 0,
        `${chapterId} ${block.resource} is invisible`,
      );
      compositions.push({
        chapterId,
        blockId: block.id,
        resource: block.resource,
        width: image.width,
        height: image.height,
        layers: image.layers.length,
        visiblePixels,
      });
      const key = image.description?.includes('横向')
        ? 'horizontal'
        : image.description?.includes('纵向')
          ? 'vertical'
          : image.layers.length >= 3
            ? 'layered'
            : null;
      if (key && !samples.some((sample) => sample.key === key))
        samples.push({ key, image });
    }
  }
  const result = {
    checkedAt: new Date().toISOString(),
    portraitCount: portraits.length,
    cgReferences: new Set(
      baseline.cgOmissions.occurrenceList.map((item) => item.reference),
    ).size,
    decodedImages: decoded.size,
    bytes: [...decoded.values()].reduce((n, item) => n + item.bytes, 0),
    compositions: compositions.length,
    requests: requests.length,
    portraits,
    compositionResults: compositions,
    decoded: [...decoded.values()],
    network: requests,
  };
  await writeFile(
    path.join(root, 'full-decode.json'),
    JSON.stringify(result, null, 2),
  );
  await writeFile(
    'docs/prts-image-decode-0.1.22.json',
    JSON.stringify(
      {
        ...result,
        verification:
          'Complete Edge raster decoding and SVG composition checks. Original bytes are fetched on first demand into an isolated verification cache; requests counts only this invocation. No full-library decode or desktop-host acceptance is asserted.',
        network: undefined,
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(root, 'ui-samples.json'), JSON.stringify(samples));
  console.log(
    JSON.stringify({
      ...result,
      portraits: undefined,
      compositionResults: undefined,
      decoded: undefined,
      network: undefined,
    }),
  );
} finally {
  await browser.close();
  new CacheCoordinator(cacheRoot).close();
}
