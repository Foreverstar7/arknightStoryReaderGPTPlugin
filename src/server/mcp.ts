import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { ReaderError } from '../data/source.js';
import {
  cacheInputSchema,
  chapterInputSchema,
  chapterSchema,
  chapterInfoSchema,
  imageResultSchema,
  readingStateSchema,
  recordInputSchema,
  settingsSchema,
  snapshotSchema,
  type ToolName,
} from '../shared/contracts.js';
import type { ReaderService } from './service.js';
import { VERSION } from '../shared/version.js';

export const RESOURCE_URI = 'ui://arknights-reader/v1/index.html';
export function createReaderMcp(
  service: ReaderService,
  projectRoot: string,
): McpServer {
  const server = new McpServer({
    name: 'arknights-story-reader',
    version: VERSION,
  });
  registerAppResource(
    server,
    'reader',
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await readFile(
            path.join(projectRoot, 'dist/ui/index.html'),
            'utf8',
          ),
          _meta: {
            'openai/ui': {
              preferredDisplayMode: 'fullscreen',
              availableDisplayModes: ['inline', 'fullscreen'],
            },
            ui: {
              csp: { connectDomains: [], resourceDomains: [] },
              prefersBorder: false,
            },
          },
        },
      ],
    }),
  );

  function tool(
    name: ToolName,
    title: string,
    input: z.ZodObject,
    output: z.ZodObject,
    readOnly: boolean,
  ) {
    registerAppTool(
      server,
      name,
      {
        title,
        description: title,
        inputSchema: input,
        outputSchema: output,
        annotations: {
          readOnlyHint: readOnly,
          destructiveHint: name === 'reader_clear_history',
          openWorldHint: [
            'reader_snapshot',
            'reader_chapter',
            'reader_record',
            'reader_image',
            'reader_chapter_info',
          ].includes(name),
        },
        _meta:
          name === 'reader_open'
            ? {
                ui: { resourceUri: RESOURCE_URI, visibility: ['app'] },
                'openai/ui': {
                  entrypoints: [{ type: 'global' }, { type: 'thread' }],
                },
              }
            : { ui: { visibility: ['app'] } },
      },
      async (args) => {
        try {
          const value = await service.call(name, args);
          const image =
            name === 'reader_image'
              ? imageResultSchema.parse(value)
              : undefined;
          const result = output.parse(value);
          return {
            structuredContent: result,
            // Binary layers only hydrate the app; they are excluded from model context.
            ...(image ? { _meta: { readerImage: image } } : {}),
            content: [
              {
                type: 'text',
                text:
                  name === 'reader_open'
                    ? '方舟剧情阅读器已就绪。'
                    : '阅读器页面操作完成。',
              },
            ],
          };
        } catch (error) {
          const message =
            error instanceof ReaderError
              ? error.message
              : '阅读器操作失败，请检查输入或本机服务后重试。';
          return { isError: true, content: [{ type: 'text', text: message }] };
        }
      },
    );
  }
  tool(
    'reader_image',
    '按需读取当前场景立绘、CG 或目录封面',
    z.object({
      kind: z.enum(['cover', 'portrait', 'cg']),
      storyId: z.string().max(200).optional(),
      chapterId: z.string().max(200).optional(),
      blockId: z.string().max(200).optional(),
    }),
    imageResultSchema.omit({ layers: true }),
    true,
  );
  tool(
    'reader_chapter_info',
    '按需读取可见篇目的关卡简介',
    chapterInputSchema.pick({ chapterId: true }),
    chapterInfoSchema,
    true,
  );
  tool(
    'reader_open',
    '打开方舟剧情阅读器',
    z.object({}),
    z.object({ ready: z.boolean(), source: z.string() }),
    true,
  );
  tool(
    'reader_snapshot',
    '读取页面目录与本机阅读记录',
    z.object({}),
    snapshotSchema,
    true,
  );
  tool(
    'reader_chapter',
    '按需读取一个篇目的正文',
    chapterInputSchema,
    chapterSchema,
    true,
  );
  tool(
    'reader_record',
    '保存阅读器段落位置与最远进度',
    recordInputSchema,
    readingStateSchema,
    false,
  );
  tool(
    'reader_settings',
    '保存阅读器设置',
    settingsSchema,
    readingStateSchema,
    false,
  );
  tool(
    'reader_clear_cache',
    '清理本机内容缓存',
    cacheInputSchema,
    z.object({ cleared: z.enum(['images', 'all']) }),
    false,
  );
  tool(
    'reader_clear_history',
    '清除本机阅读记录',
    z.object({}),
    readingStateSchema,
    false,
  );
  return server;
}
