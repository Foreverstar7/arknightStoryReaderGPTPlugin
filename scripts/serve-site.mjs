import path from 'node:path';
import express from 'express';

const port = Number(process.env.SITE_PREVIEW_PORT ?? '4330');
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw new Error('Invalid SITE_PREVIEW_PORT.');
const application = express();
application.get('/health', (_request, response) =>
  response.json({ ready: true }),
);
application.use(
  '/arknightStoryReaderGPTPlugin',
  express.static(path.resolve(import.meta.dirname, '../build/site')),
);
application.listen(port, '127.0.0.1', () => {
  console.info(`Local: http://127.0.0.1:${port}/arknightStoryReaderGPTPlugin/`);
});
