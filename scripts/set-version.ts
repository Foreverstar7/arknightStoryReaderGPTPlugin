import path from 'node:path';
import { checkVersions, setVersion } from './release-version.js';
const root = path.resolve(import.meta.dirname, '..');
const version = process.argv[2];
if (!version)
  throw new Error('用法：npm run release:version -- X.Y.Z（不创建标签或提交）');
await setVersion(root, version);
console.info(await checkVersions(root));
