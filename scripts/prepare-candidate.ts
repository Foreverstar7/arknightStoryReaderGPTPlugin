import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { stableVersion } from './release-version.js';
import { candidateMarketplace } from './marketplace.js';

const root = path.resolve(import.meta.dirname, '..');
const version = stableVersion.parse(process.argv[2]);
const { name } = z
  .object({ name: z.string().min(1) })
  .parse(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')));
const directory = path.join(
  root,
  '.local/candidate-marketplace/.agents/plugins',
);
await mkdir(directory, { recursive: true });
await writeFile(
  path.join(directory, 'marketplace.json'),
  `${JSON.stringify(candidateMarketplace(name, version), null, 2)}\n`,
);
console.info(
  `已准备 npm ${name}@${version} 的候选来源；此命令不安装或发布插件。\n` +
    'codex plugin marketplace add ./.local/candidate-marketplace\n' +
    'codex plugin marketplace upgrade arknights-reader-candidate\n' +
    'codex plugin add arknights-story-reader@arknights-reader-candidate --json',
);
