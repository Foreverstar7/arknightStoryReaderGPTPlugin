import type { CgComposition, CgLayer, Scene } from '../shared/contracts.js';
import { ReaderError } from '../shared/errors.js';

export type ScriptScene = Scene & { cgItems?: (CgLayer & { key: string })[] };
type Args = Record<string, string>;
// StoryPlayer.BQaRLFZ9.js CGItem panel's fixed stage (see cgItem below).
// Source offsets are relative to its center; do not maintain center separately.
const CG_STAGE = { width: 1280, height: 720 };
function number(args: Args, key: string, fallback: number) {
  if (args[key] === undefined) return fallback;
  const value = Number(args[key]);
  if (!Number.isFinite(value))
    throw new ReaderError('parse', `CG 参数 ${key} 不是有限数值。`);
  return value;
}
function pair(value: string | undefined) {
  if (value === undefined) return { x: 0, y: 0 };
  const [x, y, ...extra] = value.split(',').map(Number);
  if (
    x === undefined ||
    y === undefined ||
    extra.length ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  )
    throw new ReaderError('parse', 'CG 图层坐标格式不兼容。');
  return { x, y };
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
    x: CG_STAGE.width / 2 + position.x,
    y: CG_STAGE.height / 2 + position.y,
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
    ...CG_STAGE,
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
  const [cross, ...extraCross] = vertical ? widths : heights;
  const sizes = vertical ? heights : widths;
  const invalid = (): never => {
    throw new ReaderError(
      'parse',
      'PRTS CG 拼接的图片数与 solidwidth/solidheight 不匹配。',
    );
  };
  if (
    cross === undefined ||
    !Number.isFinite(cross) ||
    cross <= 0 ||
    extraCross.length ||
    sizes.length > resources.length ||
    (vertical ? resources.length > 4 : resources.length !== 2)
  )
    return invalid();
  // Pair external inputs at the boundary. The layout loop receives complete
  // tiles, never missing dimensions silently repaired with zero.
  const tiles = resources.map((resource, index) => {
    const size = sizes[index];
    if (!resource || size === undefined || !Number.isFinite(size) || size <= 0)
      return invalid();
    return {
      resource,
      width: vertical ? cross : size,
      height: vertical ? size : cross,
    };
  });
  let x = 0;
  let y = 0;
  const layers = tiles.map(({ resource, width, height }) => {
    const layer: CgLayer = { resource, kind: 'image', x, y, width, height };
    if (vertical) y += height;
    else x += width;
    return layer;
  });
  // Source dr(): vertical tiles top-to-bottom, large tiles left-to-right, at
  // explicit solid dimensions. Show the complete assembled art, not the camera
  // crop/pan; ordinary imagegroup backgrounds never create a reader CG block.
  return {
    width: vertical ? cross : x,
    height: vertical ? y : cross,
    layers,
    description: vertical ? 'CG 纵向完整拼接' : 'CG 横向完整拼接',
  };
}
