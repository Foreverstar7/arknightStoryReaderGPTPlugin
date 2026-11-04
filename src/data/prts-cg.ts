import type { CgComposition, CgLayer, Scene } from '../shared/contracts.js';
import { ReaderError } from '../shared/errors.js';

export type ScriptScene = Scene & { cgItems?: (CgLayer & { key: string })[] };
type Args = Record<string, string>;
function number(args: Args, key: string, fallback: number) {
  if (args[key] === undefined) return fallback;
  const value = Number(args[key]);
  if (!Number.isFinite(value))
    throw new ReaderError('parse', `CG 参数 ${key} 不是有限数值。`);
  return value;
}
function pair(value: string | undefined) {
  if (value === undefined) return { x: 0, y: 0 };
  const parts = value.split(',').map(Number);
  if (parts.length !== 2 || parts.some((x) => !Number.isFinite(x)))
    throw new ReaderError('parse', 'CG 图层坐标格式不兼容。');
  return { x: parts[0] ?? 0, y: parts[1] ?? 0 };
}
export function mergeCgItems(scenes: ScriptScene[]) {
  // Never combine mutually exclusive artwork. Only identical shared layers
  // survive a join, exactly like the existing character-slot merge.
  return scenes[0]?.cgItems?.filter((item) =>
    scenes.every((scene) =>
      scene.cgItems?.some(
        (other) => JSON.stringify(item) === JSON.stringify(other),
      ),
    ),
  );
}
export function cgItem(args: Args) {
  if (!args.image || (args.style && args.style !== 'cg'))
    throw new ReaderError('unsupported', 'CGItem 缺少图片或使用未适配的样式。');
  const hiding = number(args, 'ato', 1) <= 0;
  const position = pair(hiding ? args.pfrom : args.pto);
  const scale = number(args, hiding ? 'sfrom' : 'sto', 1);
  if (scale <= 0)
    throw new ReaderError('unsupported', 'CGItem 缩放不在静态展示范围。');
  // Source: StoryPlayer.BQaRLFZ9.js CGItem panel, 1280×720 stage; sprites use
  // their pixel size, a centered anchor and y-down offsets. Layer order is
  // insertion order (the source ignores `layer`); replacing a key appends it.
  // Display the visible endpoint, or the start of a fade-out. No animation time
  // is inferred. Recheck the panel's transforms/key semantics when source changes.
  const item: CgLayer & { key: string } = {
    key: args.id ? `${args.image}_${args.id}` : args.image,
    resource: args.image,
    kind: 'image',
    centered: true,
    x: 640 + position.x,
    y: 360 + position.y,
    scale,
    rotation: number(args, hiding ? 'rfrom' : 'rto', 0),
    opacity: Math.max(
      0,
      Math.min(1, number(args, hiding ? 'afrom' : 'ato', 1)),
    ),
    ...(number(args, 'width', 0) > 0 && number(args, 'height', 0) > 0
      ? { width: number(args, 'width', 0), height: number(args, 'height', 0) }
      : {}),
  };
  return { item, hiding };
}
export function itemComposition(
  items: NonNullable<ScriptScene['cgItems']>,
): CgComposition {
  return {
    width: 1280,
    height: 720,
    layers: items,
    fit: 'layers',
    description: 'CG 图层组合 · 完整静态图层，不含舞台背景与动态特效',
  };
}
export function tiledCg(command: string, args: Args): CgComposition {
  const resources = (args.cggroup ?? '')
    .split('/')
    .map((value) => value.trim());
  const widths = (args.solidwidth ?? '').split('/').map(Number);
  const heights = (args.solidheight ?? '').split('/').map(Number);
  const vertical = command === 'verticalbg';
  if (
    resources.some((value) => !value) ||
    [...widths, ...heights].some(
      (value) => !Number.isFinite(value) || value <= 0,
    ) ||
    (vertical
      ? widths.length !== 1 ||
        heights.length !== resources.length ||
        resources.length > 4
      : resources.length !== 2 || widths.length !== 2 || heights.length !== 1)
  )
    throw new ReaderError(
      'parse',
      'PRTS CG 拼接的图片数与 solidwidth/solidheight 不匹配。',
    );
  let x = 0;
  let y = 0;
  const layers = resources.map((resource, index) => {
    const width = widths[vertical ? 0 : index] ?? 0;
    const height = heights[vertical ? index : 0] ?? 0;
    const layer: CgLayer = { resource, kind: 'image', x, y, width, height };
    if (vertical) y += height;
    else x += width;
    return layer;
  });
  // Source dr(): vertical tiles top-to-bottom, large tiles left-to-right, at
  // explicit solid dimensions. Show the complete assembled art, not the camera
  // crop/pan; ordinary imagegroup backgrounds never create a reader CG block.
  return {
    width: vertical ? (widths[0] ?? 0) : x,
    height: vertical ? y : (heights[0] ?? 0),
    layers,
    description: vertical ? 'CG 纵向完整拼接' : 'CG 横向完整拼接',
  };
}
