import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import {
  snapshotSchema,
  chapterSchema,
  imageResultSchema,
} from '../src/shared/contracts.js';
import { RESOURCE_URI } from '../src/server/mcp.js';
import { collectImageResult } from '../src/shared/image-transfer.js';

const url = new URL(process.argv[2] ?? 'http://127.0.0.1:4318/mcp');
const client = new Client({ name: 'reader-http-probe', version: '0.1.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(url));
  const tools = (await client.listTools()).tools;
  const snapshot = snapshotSchema.parse(
    (await client.callTool({ name: 'reader_snapshot', arguments: {} }))
      .structuredContent,
  );
  const resource = await client.readResource({ uri: RESOURCE_URI });
  const first = (
    snapshot.stories.find((story) => story.id === 'prts:骑兵与猎人') ??
    snapshot.stories[0]
  )?.chapters[0];
  if (!first) throw new Error('目录缺少篇目。');
  const chapter = chapterSchema.parse(
    (
      await client.callTool({
        name: 'reader_chapter',
        arguments: { chapterId: first.id },
      })
    ).structuredContent,
  );
  if (resource.contents.length !== 1) throw new Error('UI 资源数不正确。');
  const cg = chapter.blocks.find((block) => block.kind === 'cg');
  let image;
  if (chapter.source === 'prts' && cg) {
    const result = await client.callTool({
      name: 'reader_image',
      arguments: { kind: 'cg', chapterId: chapter.id, blockId: cg.id },
    });
    const parsed = imageResultSchema.parse(
      await collectImageResult(result, (part) =>
        client.callTool({
          name: 'reader_image',
          arguments: {
            kind: 'cg',
            chapterId: chapter.id,
            blockId: cg.id,
            ...part,
          },
        }),
      ),
    );
    image = {
      resource: parsed.resource,
      width: parsed.width,
      height: parsed.height,
      binaryInAppMetaOnly:
        typeof result.structuredContent === 'object' &&
        result.structuredContent !== null &&
        !Object.hasOwn(result.structuredContent, 'layers'),
    };
  }
  console.info(
    JSON.stringify(
      {
        transport: 'streamable-http',
        server: client.getServerVersion(),
        tools: tools.length,
        stories: snapshot.stories.length,
        resource: RESOURCE_URI,
        source: snapshot.sourceLabel,
        image,
        chapter: {
          id: chapter.id,
          source: chapter.source,
          blocks: chapter.blocks.length,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
