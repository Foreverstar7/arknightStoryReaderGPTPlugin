import path from 'node:path';
import { mkdir, mkdtemp } from 'node:fs/promises';
import express from 'express';
import { build } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { FixtureSource } from '../../src/data/fixture.js';
import { ReaderService } from '../../src/server/service.js';
import {
  createReaderMcp,
  RESOURCE_URI,
  SEARCH_RESOURCE_URI,
} from '../../src/server/mcp.js';
import { toolRequestSchema } from '../../src/shared/contracts.js';

// Own builds and original fixture records only. Never rebuild dist/, install a
// plugin, touch .local/marketplace, or reuse a developer's preview/data service.
const base = path.resolve('.ai/local/search-card-check');
await mkdir(base, { recursive: true });
const root = await mkdtemp(path.join(base, 'run-'));
await build({ build: { outDir: path.join(root, 'dist/ui') } });
await build({
  configFile: false,
  root: path.resolve('tests/hosted'),
  plugins: [viteSingleFile()],
  build: { outDir: path.join(root, 'host'), emptyOutDir: true },
});
const service = new ReaderService(new FixtureSource(), path.join(root, 'data'));
const server = createReaderMcp(service, root);
const client = new Client({ name: 'original-iframe-check', version: '1.0.0' });
const [clientWire, serverWire] = InMemoryTransport.createLinkedPair();
await server.connect(serverWire);
await client.connect(clientWire);
const app = express();
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true, source: 'fixture' }));
app.get('/resource', async (req, res) => {
  const resource = await client.readResource({
    uri: req.query.entry === 'reader' ? RESOURCE_URI : SEARCH_RESOURCE_URI,
  });
  const html = resource.contents[0];
  if (!html || !('text' in html)) throw new Error('Missing MCP HTML resource');
  res.type('html').send(html.text);
});
app.post('/tool', async (req, res) => {
  const tool = toolRequestSchema.parse(req.body);
  res.json(
    await client.callTool({
      name: tool.name,
      arguments: z.record(z.string(), z.unknown()).parse(tool.arguments),
    }),
  );
});
app.use(express.static(path.join(root, 'host')));
const http = app.listen(
  Number(process.env.READER_HOST_E2E_PORT ?? '4349'),
  '127.0.0.1',
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    http.close();
    void client.close();
    void server.close();
  });
