import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const project = path.resolve(import.meta.dirname, '..');
const source = path.join(project, 'website');
const destination = path.join(project, 'build/site');
const allowed = new Set(['index.html', 'styles.css', 'app.js']);
async function inspect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Site contains a symlink: ${relative}`);
    if (entry.isDirectory()) {
      if (relative !== 'assets')
        throw new Error(`Unexpected site directory: ${relative}`);
      await inspect(path.join(directory, entry.name), relative);
    } else if (
      !allowed.has(relative) &&
      !/^assets\/[a-z-]+\.(?:svg|png)$/u.test(relative)
    ) {
      throw new Error(`Unexpected public site file: ${relative}`);
    }
  }
}
await inspect(source);
const html = await readFile(path.join(source, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="\.\/([^"?#]+)"/gu)) {
  await readFile(path.join(source, match[1]));
}
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
await writeFile(path.join(destination, '.nojekyll'), '');
console.info(`Static project website prepared: ${destination}`);
