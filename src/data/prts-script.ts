import { createHash } from 'node:crypto';
import {
  chapterSchema,
  type Block,
  type Chapter,
  type Leaf,
} from '../shared/contracts.js';
import { prtsPageUrl } from './prts-client.js';
import { ScriptFlow, requiresComplexFlow } from './prts-flow.js';
import { bodyText, scanScript, scriptFailure as fail } from './prts-scanner.js';
import { isReviewedSourceNoop } from './prts-compat.js';
import {
  cgItem,
  itemComposition,
  mergeCgItems,
  tiledCg,
  type ScriptScene as Scene,
} from './prts-cg.js';

type Choice = Extract<Block, { kind: 'choices' }>;
type BranchPath = {
  value: string;
  option: Choice['options'][number];
  scene: Scene;
};
type Branch = {
  paths: BranchPath[];
  shared: NonNullable<Choice['shared']>;
  selected: BranchPath[];
};
type ChapterMeta = {
  id: string;
  storyId: string;
  title: string;
  pageTitle: string;
  group?: string;
};
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex').slice(0, 24);

/** Keep only state shared by every incoming path; ambiguous portraits are never inferred. */
export function mergeScenes(scenes: Scene[]): Scene {
  const first = scenes[0];
  if (!first) return { slots: [] };
  return {
    ...(first.cgItems ? { cgItems: mergeCgItems(scenes) } : {}),
    slots: first.slots.filter((slot) =>
      scenes.every((scene) =>
        scene.slots.some(
          (other) =>
            other.slot === slot.slot && other.resource === slot.resource,
        ),
      ),
    ),
    ...(first.focus !== undefined &&
    scenes.every((scene) => scene.focus === first.focus)
      ? { focus: first.focus }
      : {}),
  };
}

const stageCommands = new Set(
  'header dialog delay playmusic stopmusic musicvolume playsound stopsound soundvolume blocker background backgroundtween camerashake cameraeffect imagetween imagerotate showitem hideitem skiptothis startbattle tutorial endtip largeimage largeimg largebgtween largeimgtween curtain characteraction charactercutin interlude avgdisplay focusout focusparam timersticker timerclear stickerclear spellsticker spellstickerclear theater bgeffect cgitem effect hidecgitem animtextclean gridbg verticalbg largebg skipnode stickertween'.split(
    ' ',
  ),
);

export function parsePrtsChapter(wiki: string, meta: ChapterMeta): Chapter {
  // Source pages may put a notice/section before their one simulator template.
  // Only the explicit template's text field is body; prefixed Wiki is not prose.
  const templates = [...wiki.matchAll(/\{\{剧情模拟器\s*\|/gu)];
  const template = templates[0];
  const source = template ? wiki.slice(template.index) : '';
  const start =
    /^\|?文本数据\s*=/mu.exec(source) ?? /\|文本数据\s*=/u.exec(source);
  const header = source.slice(0, start?.index ?? 0);
  const pathMatch = /\|文本路径\s*=\s*([^|\n]+)/u.exec(header);
  const group = /\|剧情分组\s*=\s*([^|\n]+)/u.exec(header)?.[1]?.trim();
  if (
    templates.length !== 1 ||
    !start ||
    !pathMatch?.[1] ||
    !group ||
    (meta.group !== undefined && group !== meta.group)
  )
    fail(meta.pageTitle, 1, '缺少剧情模拟器字段或剧情分组不匹配。');
  const tail = source.slice(start.index + start[0].length);
  const ending = /^\}\}\s*$/mu.exec(tail);
  if (
    !ending ||
    tail.slice(ending.index + ending[0].length).trim() !== '{{剧情导航}}'
  )
    fail(meta.pageTitle, 1, '文本数据边界不兼容。');
  const script = tail.slice(0, ending.index).trim();
  const { instructions, hasLabel, lastContentLine } = scanScript(
    script,
    meta.pageTitle,
  );
  const blocks: Block[] = [];
  let target: Leaf[] | Block[] = blocks;
  let scene: Scene = { slots: [] };
  let branch: Branch | null = null;
  let previous: Leaf | null = null;
  const diagnostics: { line: number; message: string }[] = [];
  let multi: {
    key: string;
    name: string;
    text: string;
    scenes: Scene[];
  } | null = null;
  const occurrences = new Map<string, number>();
  function identify(text: string): string {
    const digest = hash(text);
    const occurrence = (occurrences.get(digest) ?? 0) + 1;
    occurrences.set(digest, occurrence);
    return `prts-${digest}-${occurrence}`;
  }
  let currentLine = 1;
  const flow = requiresComplexFlow(instructions)
    ? new ScriptFlow(
        blocks,
        identify,
        mergeScenes,
        (message) => fail(meta.pageTitle, currentLine, message),
        (message) => diagnostics.push({ line: currentLine, message }),
      )
    : null;
  function addLeaf(leaf: Leaf) {
    if (flow) flow.add(leaf);
    else target.push(leaf);
  }
  function addText(name: string, raw: string) {
    const text = bodyText(raw);
    if (!text) return;
    if (
      name &&
      previous?.kind === 'speech' &&
      previous.name === name &&
      JSON.stringify(previous.scene) ===
        JSON.stringify({
          slots: scene.slots,
          ...(scene.focus === undefined ? {} : { focus: scene.focus }),
        })
    ) {
      previous.paragraphs.push(text);
      return;
    }
    const leaf: Leaf = name
      ? {
          id: identify(`speech:${name}:${text}`),
          kind: 'speech',
          name,
          paragraphs: [text],
          scene: structuredClone({
            slots: scene.slots,
            ...(scene.focus === undefined ? {} : { focus: scene.focus }),
          }),
        }
      : { id: identify(`narration:${text}`), kind: 'narration', text };
    addLeaf(leaf);
    previous = leaf;
  }
  function flushMulti() {
    if (!multi) return;
    const pending = multi;
    multi = null;
    const current = scene;
    scene = mergeScenes(pending.scenes);
    previous = null;
    addText(pending.name, pending.text);
    scene = current;
    previous = null;
  }
  function appendMulti(key: string, name: string, text: string, end = false) {
    if (multi && (multi.key !== key || multi.name !== name)) flushMulti();
    multi ??= { key, name, text: '', scenes: [] };
    multi.text += text;
    multi.scenes.push(structuredClone(scene));
    if (end) flushMulti();
  }
  function commitBranch() {
    if (branch)
      for (const path of branch.selected) path.scene = structuredClone(scene);
  }
  for (const instruction of instructions) {
    const { line, text } = instruction;
    currentLine = line;
    if (flow) scene = flow.scene();
    if (instruction.kind === 'invalid') throw instruction.error;
    if (instruction.kind === 'break') {
      previous = null;
      continue;
    }
    if (instruction.kind === 'text') {
      flushMulti();
      addText('', text);
      continue;
    }
    if (/fadestyle\s*:/iu.test(text))
      diagnostics.push({
        line,
        message: '源脚本 fadestyle 使用冒号；仅兼容这一非文本样式参数。',
      });
    if (instruction.kind === 'decision') {
      previous = null;
      flushMulti();
      const { options, values } = instruction;
      const labels = options.map((option) => option.label);
      if (flow) {
        if (values.length !== labels.length)
          diagnostics.push({
            line,
            message:
              'Decision 含多余 values，按来源的选项顺序对应；未虚构选项文字。',
          });
        flow.decision(options, values);
        continue;
      }
      const paths = options.map(({ label, value }): BranchPath => ({
        value,
        option: { label, blocks: [] },
        scene: structuredClone(scene),
      }));
      const shared: NonNullable<Choice['shared']> = [];
      const choice: Choice = {
        id: identify(`choice:${labels.join(';')}`),
        kind: 'choices',
        options: paths.map((path) => path.option),
        shared,
      };
      blocks.push(choice);
      branch = {
        paths,
        shared,
        selected: paths,
      };
      target = blocks;
      continue;
    }
    if (instruction.kind === 'predicate') {
      previous = null;
      flushMulti();
      if (flow) {
        flow.predicate(instruction.references);
        continue;
      }
      // The selector admits only predicates of the current simple branch.
      // Orphans, reopened and overlapping conditions use ScriptFlow instead.
      if (branch) {
        commitBranch();
        const { paths } = branch;
        const selected = instruction.references
          ? instruction.references.flatMap((value) =>
              paths.filter((path) => path.value === value),
            )
          : paths;
        scene = mergeScenes(selected.map((path) => path.scene));
        branch.selected = selected;
        const [first] = selected;
        if (selected.length === paths.length) {
          branch = null;
          target = blocks;
        } else if (selected.length === 1 && first) {
          target = first.option.blocks;
        } else {
          const labels = selected.map((path) => path.option.label);
          const shared = { labels, blocks: [] };
          branch.shared.push(shared);
          target = shared.blocks;
        }
      }
      continue;
    }
    const { command } = instruction;
    const { name, args } = command;
    if (name === 'name') {
      flushMulti();
      addText(args.name ?? '', command.text);
      continue;
    }
    previous = null;
    if (name === 'character') {
      scene = { ...scene, slots: [], focus: undefined };
      if (args.name && args.name !== 'char_empty')
        scene.slots.push({ slot: args.name2 ? 'l' : 'm', resource: args.name });
      if (args.name2 && args.name2 !== 'char_empty')
        scene.slots.push({ slot: 'r', resource: args.name2 });
      if (args.focus !== undefined && /^-?\d+$/u.test(args.focus))
        scene.focus = Number(args.focus);
      flow?.update((before) => ({
        ...before,
        slots: structuredClone(scene.slots),
        focus: scene.focus,
      }));
    } else if (name === 'charslot') {
      if (!args.slot) {
        scene = { ...scene, slots: [], focus: undefined };
        flow?.update((before) => ({ ...before, slots: [], focus: undefined }));
      } else {
        const slot = args.slot.toLowerCase();
        // `all` with no resource only adjusts focus; never infer a speaker from it.
        if (slot === 'all' && args.name === undefined) continue;
        // PRTS creates a named slot even for custom IDs. Preserve it literally;
        // never turn a source `n` into a guessed `m` or infer speaker identity.
        if (!/^[a-z][a-z0-9_]*$/u.test(slot))
          fail(meta.pageTitle, line, `尚未支持的 CharSlot 槽位 ${slot}。`);
        const normalized =
          slot === 'left'
            ? 'l'
            : slot === 'right'
              ? 'r'
              : slot === 'middle'
                ? 'm'
                : slot;
        if (args.name !== undefined) {
          const update = (before: Scene): Scene => ({
            ...before,
            slots: [
              ...before.slots.filter((item) => item.slot !== normalized),
              ...(args.name && args.name !== 'char_empty'
                ? [{ slot: normalized, resource: args.name }]
                : []),
            ],
          });
          scene = update(scene);
          flow?.update(update);
        }
      }
    } else if (name === 'cgitem' && args.image) {
      flushMulti();
      const { item, hiding } = cgItem(args);
      const visible = [
        ...(scene.cgItems ?? []).filter((other) => other.key !== item.key),
        item,
      ];
      addLeaf({
        id: identify(`cgitem:${args.image}`),
        kind: 'cg',
        label: 'PRTS CG 图层组合',
        resource: args.image,
        composition: itemComposition(visible),
      });
      const update = (before: Scene): Scene => ({
        ...before,
        cgItems: [
          ...(before.cgItems ?? []).filter((other) => other.key !== item.key),
          ...(hiding ? [] : [item]),
        ],
      });
      scene = update(scene);
      flow?.update(update);
    } else if (name === 'hidecgitem') {
      const key = args.id ? `${args.image ?? ''}_${args.id}` : args.image;
      const update = (before: Scene): Scene => ({
        ...before,
        cgItems: key ? before.cgItems?.filter((item) => item.key !== key) : [],
      });
      scene = update(scene);
      flow?.update(update);
    } else if (
      (name === 'largebg' || name === 'verticalbg') &&
      args.cggroup &&
      !args.imagegroup
    ) {
      flushMulti();
      addLeaf({
        id: identify(`cggroup:${args.cggroup}`),
        kind: 'cg',
        label: 'PRTS 拼接 CG',
        resource: args.cggroup,
        composition: tiledCg(name, args),
      });
    } else if (name === 'image' || name === 'imgeffect') {
      flushMulti();
      if (args.image)
        addLeaf({
          id: identify(`cg:${args.image}`),
          kind: 'cg',
          label: 'PRTS 场景图片',
          resource: args.image,
        });
    } else if (name === 'dialog' || name === 'aside') {
      flushMulti();
      if (command.text)
        addText(name === 'dialog' ? (args.name ?? '') : '', command.text);
    } else if (name === 'multiline') {
      appendMulti(
        'multiline',
        args.name ?? '',
        command.text,
        args.end === 'true',
      );
    } else if (name === 'subtitle' || name === 'sticker') {
      if (args.hidelog === 'true') continue;
      if (args.multi === 'true' && args.text)
        appendMulti(`${name}:${args.id ?? ''}`, '', args.text);
      else {
        flushMulti();
        if (args.text) addText('', args.text);
      }
    } else if (name === 'animtext' || name === 'spellsticker') {
      flushMulti();
      if (name === 'spellsticker' && args.action === 'hide') continue;
      // PRTS animtext contains visible <p=N> segments after the command, not in
      // its timing/style parameters. Preserve every segment in source order.
      const segments = [...command.text.matchAll(/<p=\d+>(.*?)<\/>/gu)];
      const remaining = command.text.replace(/<p=\d+>.*?<\/>/gu, '').trim();
      if (remaining) fail(meta.pageTitle, line, '动画文字分段格式不兼容。');
      if (segments.length)
        addText('', segments.map((part) => part[1]).join('\n'));
    } else if (name === 'video') {
      flushMulti();
      if (!args.res || command.text)
        fail(meta.pageTitle, line, '视频引用格式不兼容。');
      addLeaf({
        id: identify(`video:${args.res}`),
        kind: 'video',
        sourceUrl: prtsPageUrl(meta.pageTitle),
      });
    } else if (name === 'warp') {
      // StoryPlayer jumps only when an explicit Label exists; all observed
      // dangling Warp markers have none. Do not invent destinations or skip text.
      if (!args.name || command.text || hasLabel)
        fail(meta.pageTitle, line, '存在需要核对的 Warp/Label 控制流。');
      diagnostics.push({
        line,
        message: `Warp 目标 ${args.name} 在源脚本内没有 Label，按来源播放器保持顺序。`,
      });
    } else if (isReviewedSourceNoop(name, args, command.text)) {
      diagnostics.push({
        line,
        message: `来源播放器未执行的非文本指令 ${name}；未据此猜测人物状态。`,
      });
    } else if (name === 'gotopage') {
      // G2H/END ends with a game-UI return-home marker, not a story branch or
      // another body to fetch. Only this observed terminal form is supported;
      // new destinations or subsequent script lines require a source review.
      if (
        args.dest !== 'home' ||
        Object.keys(args).length !== 1 ||
        command.text ||
        line !== lastContentLine
      )
        fail(meta.pageTitle, line, '尚未支持的页面跳转或非末尾 GotoPage。');
    } else if (!stageCommands.has(name)) {
      // Literal bracket text remains narration; unknown command calls fail explicitly.
      if (!text.slice(0, text.indexOf(']')).includes('(') && command.text)
        addText('', text);
      else fail(meta.pageTitle, line, `尚未支持的脚本指令 ${name}。`);
    }
  }
  flushMulti();
  if (
    !blocks.some(
      (block) =>
        block.kind === 'speech' ||
        block.kind === 'narration' ||
        block.kind === 'choices' ||
        block.kind === 'video',
    )
  )
    fail(meta.pageTitle, 1, '正文为空。');
  return chapterSchema.parse({
    id: meta.id,
    storyId: meta.storyId,
    title: meta.title,
    source: 'prts',
    sourceUrl: prtsPageUrl(meta.pageTitle),
    revision: `prts-script-v4:${hash(script)}`,
    blocks,
    ...(diagnostics.length ? { diagnostics } : {}),
    original: {
      pageTitle: meta.pageTitle,
      textPath: pathMatch[1].trim(),
      wiki,
    },
  });
}
