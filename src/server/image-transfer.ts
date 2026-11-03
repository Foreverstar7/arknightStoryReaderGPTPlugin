import { createHash } from 'node:crypto';
import type { ReaderImage } from '../shared/contracts.js';
import { ReaderError } from '../shared/errors.js';
import {
  IMAGE_PART_CHARACTERS,
  MAX_IMAGE_PARTS,
  imagePartRequestSchema,
} from '../shared/image-transfer.js';

/** No transfer sessions or extra persisted copies: reuse the normal image cache. */
export function imageToolMetadata(image: ReaderImage, args: unknown) {
  const request = imagePartRequestSchema.parse(args);
  const serialized = JSON.stringify(image);
  const count = Math.ceil(serialized.length / IMAGE_PART_CHARACTERS);
  const index = request.partIndex ?? 0;
  if (index > 0 && !request.transferId)
    throw new ReaderError('parse', '图片后续分段缺少版本标识。');
  if (count > MAX_IMAGE_PARTS || index >= count)
    throw new ReaderError('parse', '图片传输段数或索引超过上限。');
  const transferId = createHash('sha256').update(serialized).digest('hex');
  if (request.transferId && request.transferId !== transferId)
    throw new ReaderError(
      'parse',
      '图片来源已变化，请重新读取整张图片。',
      image.sourceUrl,
    );
  if (count === 1) return { readerImage: image };
  return {
    readerImagePart: {
      transferId,
      index,
      count,
      data: serialized.slice(
        index * IMAGE_PART_CHARACTERS,
        (index + 1) * IMAGE_PART_CHARACTERS,
      ),
    },
  };
}
