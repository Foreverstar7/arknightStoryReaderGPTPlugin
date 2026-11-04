import { createHash } from 'node:crypto';
import {
  chapterSchema,
  type Block,
  type Chapter,
  type Leaf,
} from '../shared/contracts.js';
import { ReaderError } from './source.js';
import { prtsPageUrl } from './prts-client.js';
import { ScriptFlow } from './prts-flow.js';
import { isReviewedSourceNoop } from './prts-compat.js';
import {
  cgItem,
  itemComposition,
  mergeCgItems,
  tiledCg,
  type ScriptScene as Scene,
} from './prts-cg.js';

type Choice = Extract<Block, { kind: 'choices' }>;
type Command = { name: string; args: Record<string, string>; text: string };
type Branch = {
  choice: Choice;
  values: string[];
  states: Map<string, Scene>;
  selected: string[];
};
class ComplexFlow extends Error {}
type ChapterMeta = {
  id: string;
  storyId: string;
  title: string;
  pageTitle: string;
  group?: string;
};
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex').slice(0, 24);

function fail(page: string, line: number, message: string): never {
  throw new ReaderError(
    'parse',
    `PRTS「${page}」第 ${line} 行：${message} 原始文本未作为正文展示。`,
  );
}

/** Only known rich-text tags are removed; literal square brackets remain text. */
function bodyText(text: string): string {
  return text
    .replace(/<\/?(?:color|size|b|i|u)(?:=[^>]+)?>/giu, '')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/\\n/gu, '\n')
    .replace(/\{@nbs\}/giu, ' ')
    .replace(/\{@s\}/giu, '')
    .trim();
}

function argumentsOf(
  raw: string,
  page: string,
  line: number,
): Record<string, string> {
  const args: Record<string, string> = {};
  let rest = raw.trim();
  while (rest) {
    // Observed cut-in style typo uses ':'; it is a visual setting, never body
    // or control flow. Constrain the exception to that key instead of accepting
    // arbitrary malformed arguments. The runtime records it as a source warning.
    rest = rest.replace(/^fadestyle\s*:\s*/iu, 'fadestyle=');
    const match =
      /^([\w]+)\s*=\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^,]*?))\s*(?:,\s*|$)/u.exec(
        rest,
      );
    if (!match?.[1]) fail(page, line, '脚本参数格式不兼容。');
    const key = match[1].toLowerCase();
    const value = (match[2] ?? match[3] ?? match[4] ?? '').replace(
      /\\([\\"'])/gu,
      '$1',
    );
    // PRTS krliov.toolbox.js String.toObject assigns in source order: the last
    // duplicate wins, including conflicting values. Never evaluate the arguments.
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      fail(page, line, '不支持的参数名称。');
    args[key] = value;
    rest = rest.slice(match[0].length);
  }
  return args;
}

function commandOf(text: string, page: string, line: number): Command | null {
  if (!text.startsWith('[')) return null;
  // Find the command terminator outside quoted values. Never evaluate source code.
  let quote = '';
  let escaped = false;
  let end = -1;
  for (let i = 1; i < text.length; i++) {
    const character = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote) {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === ']') {
      end = i;
      break;
    }
  }
  if (end < 0) {
    if (/^\[(?:name\s*=|[A-Za-z]+\s*\()/u.test(text))
      fail(page, line, '指令缺少结束方括号。');
    return null;
  }
  const header = text.slice(1, end).trim();
  const assignment = /^([A-Za-z][\w]*)\s*=/u.exec(header);
  if (assignment?.[1])
    return {
      name: assignment[1].toLowerCase(),
      args: argumentsOf(header, page, line),
      text: text.slice(end + 1).trim(),
    };
  const match = /^([A-Za-z][\w]*)(?:\((.*)\))?$/u.exec(header);
  if (!match?.[1]) return null;
  return {
    name: match[1].toLowerCase(),
    args: argumentsOf(match[2] ?? '', page, line),
    text: text.slice(end + 1).trim(),
  };
}

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
  try {
    return parseChapter(wiki, meta, false);
  } catch (error) {
    if (!(error instanceof ComplexFlow)) throw error;
    return parseChapter(wiki, meta, true);
  }
}

function parseChapter(
  wiki: string,
  meta: ChapterMeta,
  complex: boolean,
): Chapter {
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
  const flow = complex
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
      for (const value of branch.selected)
        branch.states.set(value, structuredClone(scene));
  }
  const lines = script.split(/\r?\n/u);
  for (const [index, raw] of lines.entries()) {
    const line = index + 1;
    currentLine = line;
    if (flow) scene = flow.scene();
    const text = raw.trim();
    if (!text || text.startsWith('//')) {
      previous = null;
      continue;
    }
    const command = commandOf(text, meta.pageTitle, line);
    if (!command) {
      flushMulti();
      addText('', text);
      continue;
    }
    const { name, args } = command;
    if (/fadestyle\s*:/iu.test(text))
      diagnostics.push({
        line,
        message: '源脚本 fadestyle 使用冒号；仅兼容这一非文本样式参数。',
      });
    if (name === 'name') {
      flushMulti();
      addText(args.name ?? '', command.text);
      continue;
    }
    previous = null;
    if (name === 'decision') {
      flushMulti();
      if (branch) throw new ComplexFlow();
      const labels = args.options
        ?.split(';')
        .map((label) => bodyText(label.replace(/^&/u, '')));
      const values = args.values?.split(';').map((value) => value.trim());
      if (
        !labels?.length ||
        !values ||
        values.length < labels.length ||
        values.some((value) => !/^[1-9]\d*$/u.test(value))
      )
        fail(meta.pageTitle, line, '选项与 values 不匹配或包含不支持的值。');
      if (
        !flow &&
        (values.length !== labels.length ||
          new Set(values).size !== values.length)
      )
        throw new ComplexFlow();
      if (flow) {
        if (values.length !== labels.length)
          diagnostics.push({
            line,
            message:
              'Decision 含多余 values，按来源的选项顺序对应；未虚构选项文字。',
          });
        flow.decision(labels, values);
        continue;
      }
      const choice: Choice = {
        id: identify(`choice:${labels.join(';')}`),
        kind: 'choices',
        options: labels.map((label) => ({ label, blocks: [] })),
        shared: [],
      };
      blocks.push(choice);
      branch = {
        choice,
        values,
        states: new Map(values.map((value) => [value, structuredClone(scene)])),
        selected: values,
      };
      target = blocks;
    } else if (name === 'predicate') {
      flushMulti();
      if (flow) {
        flow.predicate(args.references);
        continue;
      }
      if (!branch) throw new ComplexFlow();
      if (args.references === '')
        fail(
          meta.pageTitle,
          line,
          'Predicate 的 references 为空，无法确定分支。',
        );
      commitBranch();
      const references = args.references
        ? args.references.split(';').map((value) => value.trim())
        : branch.values;
      if (
        references.length === 0 ||
        references.some((value) => !branch?.values.includes(value)) ||
        new Set(references).size !== references.length
      )
        throw new ComplexFlow();
      scene = mergeScenes(
        references.flatMap((value) => {
          const state = branch?.states.get(value);
          return state ? [state] : [];
        }),
      );
      branch.selected = references;
      if (references.length === branch.values.length) {
        branch = null;
        target = blocks;
      } else if (references.length === 1) {
        const option =
          branch.choice.options[branch.values.indexOf(references[0] ?? '')];
        if (!option) fail(meta.pageTitle, line, '缺少分支选项。');
        target = option.blocks;
      } else {
        const labels = references.map(
          (value) =>
            branch?.choice.options[branch.values.indexOf(value)]?.label ?? '',
        );
        const shared = { labels, blocks: [] };
        branch.choice.shared?.push(shared);
        target = shared.blocks;
      }
    } else if (name === 'character') {
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
      if (
        !args.name ||
        command.text ||
        lines.some((line) => /^\s*\[label(?:\(|\])/iu.test(line))
      )
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
        lines
          .slice(index + 1)
          .some((line) => line.trim() && !line.trim().startsWith('//'))
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
