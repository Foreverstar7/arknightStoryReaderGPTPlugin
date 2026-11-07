import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const project = path.resolve(import.meta.dirname, '..');
const source = path.join(project, 'website');
const destination = path.join(project, 'build/site');
const allowed = new Set([
  'index.html',
  'styles.css',
  'app.ts',
  'walkthrough.ts',
  'walkthrough-timing.ts',
  'walkthrough.css',
  'THIRD_PARTY_NOTICES.txt',
  'demo/index.html',
  'demo/main.tsx',
  'demo/browser-transport.ts',
  'demo/data.ts',
  'demo/assets.ts',
  'demo/styles.css',
]);
async function inspect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Site contains a symlink: ${relative}`);
    if (entry.isDirectory()) {
      if (!['assets', 'demo'].includes(relative))
        throw new Error(`Unexpected site directory: ${relative}`);
      await inspect(path.join(directory, entry.name), relative);
    } else if (
      !allowed.has(relative) &&
      !/^assets\/[a-z-]+\.(?:svg|png|webp|txt)$/u.test(relative)
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
await build({
  configFile: false,
  root: source,
  base: './',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: destination,
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        main: path.join(source, 'index.html'),
        demo: path.join(source, 'demo/index.html'),
      },
    },
  },
});
await copyFile(
  path.join(source, 'THIRD_PARTY_NOTICES.txt'),
  path.join(destination, 'THIRD_PARTY_NOTICES.txt'),
);
await writeFile(path.join(destination, '.nojekyll'), '');
console.info(`Static project website prepared: ${destination}`);
