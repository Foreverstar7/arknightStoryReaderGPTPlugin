import { imageSize } from 'image-size';
import { ReaderError } from '../shared/errors.js';

const mimeForType = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
]);

/** Inspect actual bytes; retain original encodings, alpha and face-overlay geometry. */
export function inspectImage(
  bytes: Uint8Array,
  contentType: string | null,
  sourceUrl: string,
) {
  const mime = contentType?.split(';')[0]?.trim().toLowerCase();
  if (!mime || ![...mimeForType.values()].includes(mime))
    throw new ReaderError(
      'parse',
      'PRTS 没有返回受支持的栅格图片，未将错误页面展示为图片。',
      sourceUrl,
    );
  try {
    const result = imageSize(bytes);
    if (mimeForType.get(result.type ?? '') !== mime)
      throw new Error('Image type does not match response MIME');
    if (
      !Number.isSafeInteger(result.width) ||
      !Number.isSafeInteger(result.height) ||
      result.width <= 0 ||
      result.height <= 0
    )
      throw new Error('Invalid image dimensions');
    return { mime, width: result.width, height: result.height };
  } catch {
    throw new ReaderError(
      'parse',
      'PRTS 图片内容、MIME 或尺寸不兼容，请重试。',
      sourceUrl,
    );
  }
}
