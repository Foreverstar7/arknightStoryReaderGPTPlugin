import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const web = path.join(project, 'web');
const output = path.join(project, 'build/site/reader');
const adapters = new Set(
  ['reading-store', 'word-counts', 'cache-coordinator', 'json-cache'].map(
    (name) => path.join(project, 'src/storage', name),
  ),
);
const strip = (name) => name.replace(/\.(?:[cm]?[jt]sx?)$/u, '');
let commit = 'local';
try {
  commit = execFileSync(
    'git',
    [
      '-c',
      `safe.directory=${project.replaceAll('\\', '/')}`,
      'rev-parse',
      '--short',
      'HEAD',
    ],
    { cwd: project, encoding: 'utf8' },
  ).trim();
} catch {}
await mkdir(path.join(web, 'public'), { recursive: true });
await copyFile(
  path.join(project, 'website/assets/reader-mark.svg'),
  path.join(web, 'public/icon.svg'),
);
await build({
  configFile: false,
  root: web,
  base: './',
  plugins: [
    {
      name: 'browser-reader-adapters',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source === 'node:crypto') return path.join(web, 'crypto.ts');
        if (source.startsWith('node:'))
          throw new Error(
            `Unexpected Node dependency in browser reader: ${source}`,
          );
        if (!importer || !source.startsWith('.')) return null;
        const target = strip(
          path.resolve(path.dirname(importer.split('?')[0]), source),
        );
        if (adapters.has(target)) return path.join(web, 'storage.ts');
        if (target === path.join(project, 'src/ui/components/SettingsPanel'))
          return path.join(web, 'SettingsPanel.tsx');
        return null;
      },
    },
    react(),
  ],
  define: {
    __WEB_BUILD__: JSON.stringify(
      `${new Date().toISOString().slice(0, 10)} · ${commit}`,
    ),
  },
  build: { outDir: output, emptyOutDir: true },
});
await copyFile(
  path.join(project, 'website/THIRD_PARTY_NOTICES.txt'),
  path.join(output, 'THIRD_PARTY_NOTICES.txt'),
);
console.info(`Browser reader prepared: ${output}`);
