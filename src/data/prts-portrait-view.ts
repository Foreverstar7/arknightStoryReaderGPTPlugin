import type { ImageInput, PortraitViews } from '../shared/contracts.js';
import {
  MAX_COMPOSITION_CHARACTERS,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_LAYERS,
} from '../shared/image-limits.js';
import { ReaderError } from '../shared/errors.js';
import type { ImageTarget } from './source.js';
import { placeholderPortrait, type PortraitImage } from './prts-portrait.js';
import { prtsPageUrl } from './prts-client.js';

type PortraitInput = Extract<ImageInput, { kind: 'portrait' }>;
type PortraitTarget = Extract<ImageTarget, { kind: 'portrait' }>;
type LoadPortrait = (
  reference: string,
  defaultOnly: boolean,
) => Promise<PortraitImage>;

/** Explicit scene inspection never turns a scene resource into speaker identity. */
export async function resolvePortraitView(
  input: PortraitInput,
  target: PortraitTarget,
  loadSpeaker: () => Promise<PortraitImage>,
  loadPortrait: LoadPortrait,
): Promise<PortraitImage> {
  const sourceUrl = prtsPageUrl(input.chapterId.slice(5));
  const evidence = [sourceUrl];
  const relation: PortraitViews['sceneRelation'] =
    target.resources.length === 0
      ? 'absent'
      : target.speakerBinding?.absentFromScene
        ? 'mismatch'
        : 'unconfirmed';
  function withViews(
    image: PortraitImage,
    selected: PortraitViews['selected'],
    defaultAvailable: boolean,
    sceneRelation: PortraitViews['sceneRelation'],
  ) {
    return {
      ...image,
      portrait: {
        ...image.portrait,
        views: {
          selected,
          defaultAvailable,
          sceneAvailable: target.resources.length > 0,
          sceneRelation,
        },
      },
    };
  }
  async function scene(
    defaultAvailable: boolean,
    sceneRelation: PortraitViews['sceneRelation'],
  ) {
    const references = [...new Set(target.resources)];
    const prefix =
      sceneRelation === 'mismatch'
        ? '场景立绘与发言人不一致；此处展示原场景中的立绘。'
        : '以下为原场景立绘，尚未确认角色与立绘的对应关系。';
    if (!references.length)
      return withViews(
        placeholderPortrait('', 'no_scene', '当前片段没有场景立绘。', evidence),
        null,
        defaultAvailable,
        'absent',
      );
    const images = await Promise.all(
      references.map((reference) => loadPortrait(reference, false)),
    );
    const missing = images.find(
      (image) => image.portrait.status === 'placeholder',
    );
    if (missing)
      return withViews(
        {
          ...missing,
          portrait: {
            ...missing.portrait,
            message: `${prefix}${missing.portrait.message}`,
          },
        },
        'scene',
        defaultAvailable,
        sceneRelation,
      );
    const height = Math.max(...images.map((image) => image.height));
    let width = 0;
    const layers = images.flatMap((image) => {
      const scale = height / image.height;
      const left = width;
      width += image.width * scale;
      return image.layers.map((layer) => ({
        ...layer,
        x: left + layer.x * scale,
        y: layer.y * scale,
        width: layer.width * scale,
        height: layer.height * scale,
      }));
    });
    const bytes = layers.reduce(
      (sum, layer) =>
        sum +
        Buffer.byteLength(
          layer.dataUrl.slice(layer.dataUrl.indexOf(',') + 1),
          'base64',
        ),
      0,
    );
    const characters = layers.reduce(
      (sum, layer) => sum + layer.dataUrl.length,
      0,
    );
    if (
      layers.length > MAX_IMAGE_LAYERS ||
      bytes > MAX_IMAGE_BYTES ||
      characters > MAX_COMPOSITION_CHARACTERS
    )
      throw new ReaderError(
        'unsupported',
        '原场景立绘组合超过图片显示上限，未删去或替换其中的角色。',
      );
    const fallback = images.find(
      (image) => image.portrait.status === 'default',
    );
    return withViews(
      {
        width,
        height,
        layers,
        resource: references.join(' / '),
        sourceUrl,
        portrait: {
          status: fallback ? 'default' : 'original',
          requested: references.join(' / '),
          reason:
            sceneRelation === 'mismatch'
              ? 'scene_speaker_mismatch'
              : 'scene_identity_unconfirmed',
          message:
            prefix +
            (references.length > 1
              ? '多个场景候选并列显示，未任取其中一人。'
              : '') +
            (fallback ? fallback.portrait.message : ''),
          evidence: [
            ...new Set([
              ...evidence,
              ...images.flatMap((image) => image.portrait.evidence),
            ]),
          ],
        },
      },
      'scene',
      defaultAvailable,
      sceneRelation,
    );
  }
  async function defaultView(reference: string) {
    const image = await loadPortrait(reference, true);
    return withViews(
      {
        ...image,
        portrait: {
          ...image.portrait,
          ...(image.portrait.status === 'default'
            ? {
                reason: 'user_selected_default',
                message: '当前显示该角色同一造型的默认立绘。',
              }
            : {}),
        },
      },
      'default',
      true,
      'matched',
    );
  }
  // Explicit views do not fetch an already identified alternative first.
  if (input.portraitView === 'scene' && target.speakerBinding?.absentFromScene)
    return scene(true, relation);
  if (
    input.portraitView === 'default' &&
    target.speakerBinding &&
    !target.speakerBinding.absentFromScene
  )
    return defaultView(target.speakerBinding.reference);
  const speaker = await loadSpeaker();
  const defaultReference =
    target.speakerBinding?.reference ??
    (speaker.portrait.status !== 'placeholder'
      ? speaker.portrait.requested
      : undefined);
  if (input.portraitView === 'default') {
    if (!defaultReference)
      return withViews(
        placeholderPortrait(
          '',
          'default_unconfirmed',
          '尚未确认发言人的角色或造型，不能选择可靠的默认立绘。',
          evidence,
        ),
        null,
        false,
        relation,
      );
    if (target.speakerBinding?.absentFromScene)
      return withViews(speaker, 'default', true, relation);
    return defaultView(defaultReference);
  }
  if (input.portraitView === 'scene') {
    if (
      speaker.portrait.status === 'placeholder' ||
      target.speakerBinding?.default
    )
      return scene(Boolean(defaultReference), relation);
    return withViews(speaker, 'scene', Boolean(defaultReference), 'matched');
  }
  return withViews(
    speaker,
    speaker.portrait.status === 'placeholder'
      ? null
      : speaker.portrait.status === 'default'
        ? 'default'
        : 'scene',
    Boolean(defaultReference),
    target.speakerBinding?.absentFromScene
      ? relation
      : speaker.portrait.status === 'placeholder'
        ? relation
        : 'matched',
  );
}
