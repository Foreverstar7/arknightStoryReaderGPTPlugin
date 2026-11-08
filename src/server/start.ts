import path from 'node:path';
import { homedir } from 'node:os';
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import express from 'express';
import { ReaderError, type StorySource } from '../data/source.js';
import { toolRequestSchema } from '../shared/contracts.js';
import { createReaderMcp } from './mcp.js';
import { ReaderService } from './service.js';
import { VERSION } from '../shared/version.js';

const projectRoot = path.resolve(import.meta.dirname, '../..');
export function readerDataRoot() {
  const installedRoot =
    process.platform === 'win32'
      ? path.join(
          process.env.LOCALAPPDATA ?? path.join(homedir(), 'AppData/Local'),
          'ArknightsStoryReader',
        )
      : path.join(
          process.env.XDG_DATA_HOME ?? path.join(homedir(), '.local/share'),
          'arknights-story-reader',
        );
  return (
    process.env.READER_DATA_DIR ??
    (process.argv.includes('--installed')
      ? installedRoot
      : path.join(projectRoot, '.runtime'))
  );
}

export async function startReader(
  source: StorySource,
  dataRoot: string,
  sourceMode: string,
) {
  const service = new ReaderService(source, dataRoot);

  if (process.argv.includes('--stdio')) {
    // stdout is exclusively MCP protocol traffic, including when launched by a plugin host.
    await createReaderMcp(service, projectRoot, {
      pluginTarget: process.env.READER_PLUGIN_TARGET,
    }).connect(new StdioServerTransport());
  } else {
    const port = Number(process.env.PORT ?? 4318);
    const app = createMcpExpressApp({ host: '127.0.0.1' });
    const origins = new Set([
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
      'http://127.0.0.1:5173',
      'http://localhost:5173',
    ]);
    app.use((req, res, next) => {
      const origin = req.get('origin');
      if (origin && !origins.has(origin)) {
        res.status(403).json({ error: '不允许的请求来源。' });
        return;
      }
      next();
    });
    app.get('/health', (_req, res) =>
      res.json({ ok: true, source: sourceMode, version: VERSION }),
    );
    app.post('/api/tools', async (req, res) => {
      const request = toolRequestSchema.safeParse(req.body);
      if (!request.success) {
        res.status(400).json({ error: '页面请求格式不正确。' });
        return;
      }
      try {
        res.json(await service.call(request.data.name, request.data.arguments));
      } catch (error) {
        res
          .status(
            error instanceof ReaderError && error.code === 'not_found'
              ? 404
              : 400,
          )
          .json({
            error:
              error instanceof ReaderError
                ? error.message
                : '页面请求失败，请检查输入后重试。',
            code: error instanceof ReaderError ? error.code : 'invalid_input',
            sourceUrl:
              error instanceof ReaderError ? error.sourceUrl : undefined,
          });
      }
    });
    app.all('/mcp', async (req, res) => {
      const server = createReaderMcp(service, projectRoot, {
        pluginTarget: process.env.READER_PLUGIN_TARGET,
      });
      const transport = new NodeStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch {
        if (!res.headersSent) res.status(500).json({ error: 'MCP 通信失败。' });
      }
    });
    app.use(
      express.static(path.join(projectRoot, 'dist/ui'), {
        index: 'index.html',
      }),
    );
    const http = app.listen(port, '127.0.0.1', () =>
      console.info(
        `Reader: http://127.0.0.1:${port} · MCP: /mcp · source=${sourceMode}`,
      ),
    );
    function shutdown() {
      http.close();
    }
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}
