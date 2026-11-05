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
  imageInputSchema,
  imageResultSchema,
  type ToolName,
} from '../shared/contracts.js';
import { toolContracts } from '../shared/tools.js';
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

  function register<
    Args extends Record<string, unknown>,
    Result extends Record<string, unknown>,
  >(
    name: ToolName,
    title: string,
    schemas: { input: z.ZodType<Args>; output: z.ZodType<Result> },
    readOnly: boolean,
    run: (args: Args) => Promise<{
      value: Result;
      meta?: Record<string, unknown>;
    }>,
  ) {
    registerAppTool(
      server,
      name,
      {
        title,
        description: title,
        inputSchema: schemas.input,
        outputSchema: schemas.output,
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
          const { value, meta } = await run(args);
          return {
            structuredContent: value,
            ...(meta ? { _meta: meta } : {}),
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
  function tool<Name extends Exclude<ToolName, 'reader_image'>>(
    name: Name,
    title: string,
    readOnly: boolean,
  ) {
    register(name, title, toolContracts[name], readOnly, async (args) => ({
      value: await service.execute(name, args),
    }));
  }
  register(
    'reader_image',
    '按需读取当前场景立绘、CG 或目录封面',
    {
      // Preserve the existing MCP object envelope. The logical contract below
      // checks which identifiers the selected image kind requires.
      input: z.object({
        kind: z.enum(['cover', 'portrait', 'cg']),
        storyId: z.string().max(200).optional(),
        chapterId: z.string().max(200).optional(),
        blockId: z.string().max(200).optional(),
        refresh: z.boolean().optional(),
        ...imagePartRequestSchema.shape,
      }),
      output: z.object(imageResultSchema.shape).omit({ layers: true }),
    },
    true,
    async (args) => {
      if ((args.partIndex ?? 0) > 0 && args.cacheEpoch === undefined)
        throw new ReaderError('parse', '图片后续分段缺少缓存代次。');
      const transfer = await service.imageForTransfer(
        imageInputSchema.parse(args),
        args.cacheEpoch,
      );
      // Binary layers only hydrate the app; exclude them from structured content.
      const { layers, ...summary } = transfer.image;
      return {
        value: summary,
        meta: imageToolMetadata(transfer.image, args, transfer.cacheEpoch),
      };
    },
  );
  tool('reader_chapter_info', '按需读取可见篇目的关卡简介', true);
  tool('reader_open', '打开方舟剧情阅读器', true);
  tool('reader_snapshot', '读取页面目录与本机阅读记录，可主动刷新目录', true);
  tool('reader_chapter', '按需读取一个篇目的正文', true);
  tool(
    'reader_prepare_chapter',
    '为当前打开的剧情缓存一篇正文并统计字数，不标记已读或获取图片',
    true,
  );
  tool('reader_record', '保存阅读器段落位置与最远进度', false);
  tool('reader_settings', '保存阅读器设置', false);
  tool('reader_clear_cache', '清理本机内容缓存', false);
  tool('reader_clear_history', '清除本机阅读记录（指定剧情或全部）', false);
  return server;
}
