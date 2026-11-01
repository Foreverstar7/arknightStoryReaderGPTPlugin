import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { snapshotSchema } from '../src/shared/contracts.js';
import { RESOURCE_URI } from '../src/server/mcp.js';

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
  if (resource.contents.length !== 1) throw new Error('UI 资源数不正确。');
  console.info(
    JSON.stringify(
      {
        transport: 'streamable-http',
        server: client.getServerVersion(),
        tools: tools.length,
        stories: snapshot.stories.length,
        resource: RESOURCE_URI,
        source: 'fixture',
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
