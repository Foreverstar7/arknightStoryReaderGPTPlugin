import { z } from 'zod';
import { rasterDataUrlSchema, type ReaderImage } from '../shared/contracts.js';
import { ReaderError } from '../shared/errors.js';
import {
  MAX_IMAGE_BYTES,
  MAX_COMPOSITION_CHARACTERS,
} from '../shared/image-limits.js';
import { inspectImage } from './image-format.js';
import {
  safeImageUrl,
  publicResponse,
  limitedBytes,
} from './prts-resource-source.js';
import type { ResourceLayer } from './prts-portrait.js';

export const rasterSchema = z.object({
  dataUrl: rasterDataUrlSchema,
  width: z.number().positive(),
  height: z.number().positive(),
});
export type RasterImage = z.infer<typeof rasterSchema>;
export async function readRaster(
  url: string,
  request: typeof fetch,
): Promise<RasterImage> {
  if (!safeImageUrl(url))
    throw new ReaderError('unsupported', 'PRTS 图片来源不在已验证范围内。');
  const response = await publicResponse(url, request);
  const bytes = await limitedBytes(response, MAX_IMAGE_BYTES);
  const info = inspectImage(bytes, response.headers.get('content-type'), url);
  return {
    dataUrl: `data:${info.mime};base64,${bytes.toString('base64')}`,
    width: info.width,
    height: info.height,
  };
}

/** Read in source order, checking the aggregate budget before another download.
 * The caller owns caching/epochs; composition never chooses another resource. */
export async function renderImage(
  layers: ResourceLayer[],
  resource: string,
  sourceUrl: string,
  read: (url: string) => Promise<RasterImage>,
  canvas?: { width: number; height: number; fit?: 'layers' },
): Promise<ReaderImage> {
  const rendered = [];
  let encodedLength = 0;
  for (const layer of layers) {
    const image = await read(layer.url);
    encodedLength += image.dataUrl.length;
    // Keep compositions within the existing 64 × 1M-character transport.
    // This is an aggregate budget; per-original raster budget stays 20 MB.
    if (encodedLength > MAX_COMPOSITION_CHARACTERS)
      throw new ReaderError(
        'unsupported',
        'CG 组合超过本次图片传输预算，请到 PRTS 查看。',
        sourceUrl,
      );
    const width = (layer.width ?? image.width) * (layer.scale ?? 1);
    const height = (layer.height ?? image.height) * (layer.scale ?? 1);
    rendered.push({
      ...image,
      sourceUrl: layer.url,
      x: layer.x - (layer.centered ? width / 2 : 0),
      y: layer.y - (layer.centered ? height / 2 : 0),
      width,
      height,
      ...(layer.rotation === undefined ? {} : { rotation: layer.rotation }),
      ...(layer.opacity === undefined ? {} : { opacity: layer.opacity }),
    });
  }
  const base = rendered[0];
  if (!base)
    throw new ReaderError('resource_missing', 'PRTS 图片没有可显示图层。');
  if (canvas?.fit === 'layers') {
    // CGItem can traverse completely outside the stage. Keep all art visible
    // in this static reader, preserving relative geometry and rotation, instead
    // of presenting a blank camera crop as a successfully loaded image.
    const bounds = rendered.map((layer) => {
      const angle = ((layer.rotation ?? 0) * Math.PI) / 180;
      const width =
        Math.abs(layer.width * Math.cos(angle)) +
        Math.abs(layer.height * Math.sin(angle));
      const height =
        Math.abs(layer.width * Math.sin(angle)) +
        Math.abs(layer.height * Math.cos(angle));
      const x = layer.x + layer.width / 2;
      const y = layer.y + layer.height / 2;
      return {
        left: x - width / 2,
        top: y - height / 2,
        right: x + width / 2,
        bottom: y + height / 2,
      };
    });
    const left = Math.min(...bounds.map((bound) => bound.left));
    const top = Math.min(...bounds.map((bound) => bound.top));
    canvas = {
      width: Math.max(...bounds.map((bound) => bound.right)) - left,
      height: Math.max(...bounds.map((bound) => bound.bottom)) - top,
    };
    for (const layer of rendered) {
      layer.x -= left;
      layer.y -= top;
    }
  }
  return {
    width: canvas?.width ?? base.width,
    height: canvas?.height ?? base.height,
    layers: rendered,
    resource,
    sourceUrl,
  };
}
