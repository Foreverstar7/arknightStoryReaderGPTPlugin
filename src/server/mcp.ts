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
  clearHistoryInputSchema,
  chapterInputSchema,
  chapterCountSchema,
  chapterSchema,
  chapterInfoSchema,
  imageInputSchema,
  imageResultSchema,
  readingStateSchema,
  recordInputSchema,
  settingsSchema,
  snapshotSchema,
  snapshotInputSchema,
  type ToolName,
} from '../shared/contracts.js';
import type { ReaderService } from './service.js';
import { VERSION } from '../shared/version.js';
import { imageToolMetadata } from './image-transfer.js';
import { imagePartRequestSchema } from '../shared/image-transfer.js';

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
            'reader_prepare_chapter',
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
          const part =
            name === 'reader_image'
              ? imagePartRequestSchema.parse(args)
              : undefined;
          if (
            part &&
            (part.partIndex ?? 0) > 0 &&
            part.cacheEpoch === undefined
          )
            throw new ReaderError('parse', '图片后续分段缺少缓存代次。');
          const transfer = part
            ? await service.imageForTransfer(
                imageInputSchema.parse(args),
                part.cacheEpoch,
              )
            : undefined;
          const value = transfer
            ? transfer.image
            : await service.call(name, args);
          const result = output.parse(value);
          return {
            structuredContent: result,
            // Binary layers only hydrate the app; they are excluded from model context.
            ...(transfer
              ? {
                  _meta: imageToolMetadata(
                    transfer.image,
                    args,
                    transfer.cacheEpoch,
                  ),
                }
              : {}),
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
          const failure =
            error instanceof ReaderError
              ? error.toFailure()
              : { code: 'invalid_input', message };
          return {
            isError: true,
            _meta: { readerError: failure },
            content: [{ type: 'text', text: message }],
          };
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
      refresh: z.boolean().optional(),
      ...imagePartRequestSchema.shape,
    }),
    z.object(imageResultSchema.shape).omit({ layers: true }),
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
    '读取页面目录与本机阅读记录，可主动刷新目录',
    snapshotInputSchema,
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
    'reader_prepare_chapter',
    '为当前打开的剧情缓存一篇正文并统计字数，不标记已读或获取图片',
    chapterInputSchema.pick({ chapterId: true }),
    chapterCountSchema,
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
    '清除本机阅读记录（指定剧情或全部）',
    clearHistoryInputSchema,
    readingStateSchema,
    false,
  );
  return server;
}
