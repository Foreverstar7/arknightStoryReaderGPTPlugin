import { ReaderError } from './source.js';

export type DecisionOption = { label: string; value: string };
type Command = { name: string; args: Record<string, string>; text: string };
type Located = { line: number; text: string };
export type ScriptLine = Located &
  (
    | { kind: 'break' }
    | { kind: 'text' }
    | { kind: 'command'; command: Command }
    | { kind: 'decision'; options: DecisionOption[]; values: string[] }
    | { kind: 'predicate'; references: string[] | undefined }
    | { kind: 'invalid'; error: ReaderError }
  );

export function scriptFailure(
  page: string,
  line: number,
  message: string,
): never {
  throw new ReaderError(
    'parse',
    `PRTS「${page}」第 ${line} 行：${message} 原始文本未作为正文展示。`,
  );
}

/** Only known rich-text tags are removed; literal square brackets remain text. */
export function bodyText(text: string): string {
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
    if (!match?.[1]) scriptFailure(page, line, '脚本参数格式不兼容。');
    const key = match[1].toLowerCase();
    const value = (match[2] ?? match[3] ?? match[4] ?? '').replace(
      /\\([\\"'])/gu,
      '$1',
    );
    // PRTS krliov.toolbox.js String.toObject assigns in source order: the last
    // duplicate wins, including conflicting values. Never evaluate the arguments.
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      scriptFailure(page, line, '不支持的参数名称。');
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
      scriptFailure(page, line, '指令缺少结束方括号。');
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

function scanLine(text: string, page: string, line: number): ScriptLine {
  const position = { text, line };
  if (!text || text.startsWith('//')) return { ...position, kind: 'break' };
  const command = commandOf(text, page, line);
  if (!command) return { ...position, kind: 'text' };
  if (command.name === 'decision') {
    const labels = command.args.options
      ?.split(';')
      .map((label) => bodyText(label.replace(/^&/u, '')));
    const values = command.args.values?.split(';').map((value) => value.trim());
    const invalid = () =>
      scriptFailure(page, line, '选项与 values 不匹配或包含不支持的值。');
    if (
      !labels?.length ||
      !values ||
      values.some((value) => !/^[1-9]\d*$/u.test(value))
    )
      return invalid();
    const options = labels.map((label, index): DecisionOption => {
      const value = values[index];
      if (value === undefined) return invalid();
      return { label, value };
    });
    return { ...position, kind: 'decision', options, values };
  }
  if (command.name === 'predicate') {
    if (command.args.references === '')
      scriptFailure(page, line, 'Predicate 的 references 为空，无法确定分支。');
    return {
      ...position,
      kind: 'predicate',
      references: command.args.references
        ?.split(';')
        .map((value) => value.trim()),
    };
  }
  return { ...position, kind: 'command', command };
}

/** Scan each field once and retain source-relative lines, including separators.
 * Defer the first malformed line until projection reaches it: a later lexical
 * error must not hide an earlier unsupported command/control-flow diagnostic.
 * Unexpected programming errors are never converted to source diagnostics.
 */
export function scanScript(script: string, page: string) {
  const instructions: ScriptLine[] = [];
  let hasLabel = false;
  let lastContentLine = 0;
  let invalid = false;
  for (const [index, raw] of script.split(/\r?\n/u).entries()) {
    const text = raw.trim();
    const line = index + 1;
    if (/^\s*\[label(?:\(|\])/iu.test(raw)) hasLabel = true;
    if (text && !text.startsWith('//')) lastContentLine = line;
    // Warp and terminal GotoPage checks inspect the entire raw source, even
    // beyond a malformed field. Do not change their earlier error precedence.
    if (invalid) continue;
    try {
      instructions.push(scanLine(text, page, line));
    } catch (error) {
      if (!(error instanceof ReaderError)) throw error;
      instructions.push({ kind: 'invalid', text, line, error });
      invalid = true;
    }
  }
  return { instructions, hasLabel, lastContentLine };
}
