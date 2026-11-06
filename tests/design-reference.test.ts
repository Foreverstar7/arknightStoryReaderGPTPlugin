import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('the design preview loads the production UI entry instead of an independent prototype', async () => {
  const app = await readFile('index.html', 'utf8');
  const preview = await readFile('docs/design/reader-preview.html', 'utf8');
  const entry = (html: string) =>
    /<script type="module" src="([^"]+)"><\/script>/u.exec(html)?.[1];
  assert.equal(entry(app), '/src/ui/main.tsx');
  assert.equal(entry(preview), entry(app));
  assert.match(preview, /<div id="root"><\/div>/u);
  assert.doesNotMatch(preview, /data:image|srcdoc|const books/u);
  await readFile('src/ui/main.tsx');
});
