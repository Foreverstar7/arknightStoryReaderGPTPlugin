import { createHash } from 'node:crypto';
import {
  chapterSchema,
  type Block,
  type Chapter,
  type Leaf,
  type Scene,
} from '../shared/contracts.js';
import { ReaderError } from './source.js';
import { prtsPageUrl } from './prts-client.js';

type Choice = Extract<Block, { kind: 'choices' }>;
type Command = { name: string; args: Record<string, string>; text: string };
type Branch = {
  choice: Choice;
  values: string[];
  states: Map<string, Scene>;
  selected: string[];
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
    const match =
      /^([\w]+)\s*=\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^,]*?))\s*(?:,\s*|$)/u.exec(
        rest,
      );
    if (!match?.[1]) fail(page, line, '脚本参数格式不兼容。');
    const key = match[1].toLowerCase();
    if (Object.hasOwn(args, key)) fail(page, line, `重复参数 ${key}。`);
    args[key] = (match[2] ?? match[3] ?? match[4] ?? '').replace(
      /\\([\\"'])/gu,
      '$1',
    );
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
  'header dialog delay playmusic stopmusic musicvolume playsound stopsound soundvolume blocker background backgroundtween camerashake cameraeffect imagetween imagerotate showitem hideitem skiptothis startbattle tutorial endtip largeimage largeimg largebgtween largeimgtween curtain characteraction charactercutin interlude animtext avgdisplay focusout focusparam timersticker timerclear stickerclear spellsticker spellstickerclear theater bgeffect cgitem effect hidecgitem'.split(
    ' ',
  ),
);

export function parsePrtsChapter(
  wiki: string,
  meta: {
    id: string;
    storyId: string;
    title: string;
    pageTitle: string;
    group?: string;
  },
): Chapter {
  const start = /^\|?文本数据\s*=/mu.exec(wiki) ?? /\|文本数据\s*=/u.exec(wiki);
  const pathMatch = /\|文本路径\s*=\s*([^|\n]+)/u.exec(wiki);
  const group = /\|剧情分组\s*=\s*([^|\n]+)/u.exec(wiki)?.[1]?.trim();
  if (
    !wiki.startsWith('{{剧情模拟器|') ||
    !start ||
    !pathMatch?.[1] ||
    !group ||
    (meta.group !== undefined && group !== meta.group)
  )
    fail(meta.pageTitle, 1, '缺少剧情模拟器字段或剧情分组不匹配。');
  const tail = wiki.slice(start.index + start[0].length);
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
  const occurrences = new Map<string, number>();
  function identify(text: string): string {
    const digest = hash(text);
    const occurrence = (occurrences.get(digest) ?? 0) + 1;
    occurrences.set(digest, occurrence);
    return `prts-${digest}-${occurrence}`;
  }
  function addText(name: string, raw: string) {
    const text = bodyText(raw);
    if (!text) return;
    if (
      name &&
      previous?.kind === 'speech' &&
      previous.name === name &&
      JSON.stringify(previous.scene) === JSON.stringify(scene)
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
          scene: structuredClone(scene),
        }
      : { id: identify(`narration:${text}`), kind: 'narration', text };
    target.push(leaf);
    previous = leaf;
  }
  function commitBranch() {
    if (branch)
      for (const value of branch.selected)
        branch.states.set(value, structuredClone(scene));
  }
  const lines = script.split(/\r?\n/u);
  for (const [index, raw] of lines.entries()) {
    const line = index + 1;
    const text = raw.trim();
    if (!text || text.startsWith('//')) {
      previous = null;
      continue;
    }
    const command = commandOf(text, meta.pageTitle, line);
    if (!command) {
      addText('', text);
      continue;
    }
    const { name, args } = command;
    if (name === 'name') {
      addText(args.name ?? '', command.text);
      continue;
    }
    previous = null;
    if (name === 'decision') {
      if (branch)
        fail(
          meta.pageTitle,
          line,
          '遇到嵌套或尚未合流的 Decision，当前切片不支持此控制流。',
        );
      const labels = args.options
        ?.split(';')
        .map((label) => bodyText(label.replace(/^&/u, '')));
      const values = args.values?.split(';').map((value) => value.trim());
      if (
        !labels?.length ||
        !values ||
        values.length !== labels.length ||
        values.some((value) => !/^[1-9]\d*$/u.test(value)) ||
        new Set(values).size !== values.length
      )
        fail(meta.pageTitle, line, '选项与 values 不匹配或包含不支持的值。');
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
      if (!branch)
        fail(meta.pageTitle, line, 'Predicate 没有可对应的 Decision。');
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
        fail(meta.pageTitle, line, 'Predicate 引用了未知选项。');
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
      scene = { slots: [] };
      if (args.name && args.name !== 'char_empty')
        scene.slots.push({ slot: args.name2 ? 'l' : 'm', resource: args.name });
      if (args.name2 && args.name2 !== 'char_empty')
        scene.slots.push({ slot: 'r', resource: args.name2 });
      if (args.focus !== undefined && /^-?\d+$/u.test(args.focus))
        scene.focus = Number(args.focus);
    } else if (name === 'charslot') {
      if (!args.slot) scene = { slots: [] };
      else {
        const slot = args.slot;
        if (!['m', 'l', 'r', 'left', 'right', 'middle'].includes(slot))
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
          scene = {
            ...scene,
            slots: scene.slots.filter((item) => item.slot !== normalized),
          };
          if (args.name && args.name !== 'char_empty')
            scene.slots.push({ slot: normalized, resource: args.name });
        }
      }
    } else if (name === 'image') {
      if (args.image)
        target.push({
          id: identify(`cg:${args.image}`),
          kind: 'cg',
          label: 'PRTS 场景图片',
          resource: args.image,
        });
    } else if (name === 'dialog' || name === 'aside') {
      if (command.text)
        addText(name === 'dialog' ? (args.name ?? '') : '', command.text);
    } else if (name === 'subtitle' || name === 'sticker') {
      if (args.multi === 'true')
        fail(meta.pageTitle, line, '尚未支持多段字幕聚合。');
      if (args.hidelog !== 'true' && args.text) addText('', args.text);
    } else if (!stageCommands.has(name)) {
      // Literal bracket text remains narration; unknown command calls fail explicitly.
      if (!text.slice(0, text.indexOf(']')).includes('(') && command.text)
        addText('', text);
      else fail(meta.pageTitle, line, `尚未支持的脚本指令 ${name}。`);
    }
  }
  if (
    !blocks.some(
      (block) =>
        block.kind === 'speech' ||
        block.kind === 'narration' ||
        block.kind === 'choices',
    )
  )
    fail(meta.pageTitle, 1, '正文为空。');
  return chapterSchema.parse({
    id: meta.id,
    storyId: meta.storyId,
    title: meta.title,
    source: 'prts',
    sourceUrl: prtsPageUrl(meta.pageTitle),
    revision: `prts-script-v1:${hash(script)}`,
    blocks,
    original: {
      pageTitle: meta.pageTitle,
      textPath: pathMatch[1].trim(),
      wiki,
    },
  });
}
