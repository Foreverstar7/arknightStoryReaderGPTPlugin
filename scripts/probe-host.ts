import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { z } from 'zod';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hostOptions } from './host-options.js';

// Exercise the same plugin loader and catalog API as the desktop client.
// No model call, thread creation, or UI automation is involved.
const projectRoot = path.resolve(import.meta.dirname, '..');
const cli = process.env.CODEX_CLI_PATH ?? 'codex';
const options = await hostOptions(process.argv.slice(2), projectRoot);
const env = { ...process.env };
if (options.isolated) {
  const base = path.join(projectRoot, '.ai/local/probes');
  await mkdir(base, { recursive: true });
  const home = await mkdtemp(path.join(base, 'host-'));
  env.CODEX_HOME = home;
  env.READER_DATA_DIR = path.join(home, 'reader-data');
  env.READER_SOURCE = process.env.READER_SOURCE ?? 'prts';
  const exec = promisify(execFile);
  await exec(
    cli,
    ['plugin', 'marketplace', 'add', options.marketplaceRoot, '--json'],
    { env, timeout: 60_000 },
  );
  await exec(cli, ['plugin', 'add', options.pluginId, '--json'], {
    env,
    timeout: 120_000,
  });
}
const child = spawn(cli, ['app-server', '--stdio'], {
  cwd: projectRoot,
  stdio: ['pipe', 'pipe', 'pipe'],
  env,
});
const lines = createInterface({ input: child.stdout });
const waiting = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
let sequence = 0;
let diagnostics = '';
child.stderr.on('data', (bytes: Buffer) => {
  diagnostics += bytes.toString();
});
const envelopeSchema = z.object({
  id: z.number().optional(),
  result: z.unknown().optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
});
lines.on('line', (line) => {
  let packet: unknown;
  try {
    packet = JSON.parse(line);
  } catch {
    return;
  }
  const envelope = envelopeSchema.safeParse(packet);
  if (!envelope.success || envelope.data.id === undefined) return;
  const pending = waiting.get(envelope.data.id);
  if (!pending) return;
  waiting.delete(envelope.data.id);
  if (envelope.data.error)
    pending.reject(new Error(envelope.data.error.message));
  else pending.resolve(envelope.data.result);
});
child.on('error', (error) => {
  for (const pending of waiting.values()) pending.reject(error);
  waiting.clear();
});
child.on('exit', () => {
  for (const pending of waiting.values())
    pending.reject(new Error('宿主诊断进程已退出。'));
  waiting.clear();
});
child.stdin.on('error', (error) => {
  for (const pending of waiting.values()) pending.reject(error);
  waiting.clear();
});

function call(method: string, params: object): Promise<unknown> {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error(`宿主接口超时：${method}`));
    }, 15_000);
    waiting.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
}

try {
  await call('initialize', {
    clientInfo: {
      name: 'arknights-reader-probe',
      title: 'Reader integration check',
      version: '1.0.0',
    },
    capabilities: { experimentalApi: true, requestAttestation: false },
  });
  child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
  const plugin = z
    .object({
      plugin: z.object({
        summary: z.object({
          localVersion: z.string().nullable(),
          enabled: z.boolean(),
          installed: z.boolean(),
        }),
        mcpServers: z.array(z.string()),
      }),
    })
    .parse(
      await call('plugin/read', {
        marketplacePath: options.marketplacePath,
        pluginName: options.pluginName,
      }),
    ).plugin;
  if (
    !plugin.summary.installed ||
    !plugin.summary.enabled ||
    !plugin.mcpServers.includes('reader')
  )
    throw new Error('插件未启用，或宿主未载入 reader MCP 组件。');
  const toolSchema = z.object({
    name: z.string(),
    _meta: z.unknown().optional(),
  });
  const status = z
    .object({
      data: z.array(
        z.object({
          name: z.string(),
          pluginId: z.string().nullable(),
          // CLI 0.153.4 omits this field; 0.166 alpha reports it explicitly.
          toolsError: z.string().nullable().optional(),
          tools: z.record(z.string(), toolSchema),
        }),
      ),
    })
    .parse(await call('mcpServerStatus/list', { limit: 200, detail: 'full' }));
  const server = status.data.find((item) => item.pluginId === options.pluginId);
  if (!server) throw new Error('宿主目录没有 reader 服务。');
  if (server.toolsError)
    throw new Error(`宿主发现工具失败：${server.toolsError}`);
  const open = Object.values(server.tools).find(
    (tool) => tool.name === 'reader_open',
  );
  if (!open) throw new Error('宿主目录没有 reader_open 入口工具。');
  const metadata = z
    .object({
      ui: z.object({
        resourceUri: z.string(),
        visibility: z.array(z.string()),
      }),
      'openai/ui': z.object({
        entrypoints: z.array(z.object({ type: z.string() })),
      }),
    })
    .parse(open._meta);
  if (!metadata['openai/ui'].entrypoints.some((item) => item.type === 'global'))
    throw new Error('宿主没有发现全局侧栏入口声明。');
  if (metadata.ui.visibility.includes('model'))
    throw new Error('内部入口意外暴露给模型。');
  for (const tool of Object.values(server.tools)) {
    const { ui } = z
      .object({ ui: z.object({ visibility: z.array(z.string()) }) })
      .parse(tool._meta);
    if (!ui.visibility.includes('app') || ui.visibility.includes('model'))
      throw new Error(`内部工具可见性错误：${tool.name}`);
  }
  console.info(
    JSON.stringify(
      {
        pluginVersion: plugin.summary.localVersion,
        installed: plugin.summary.installed,
        pluginId: options.pluginId,
        marketplacePath: options.marketplacePath,
        isolated: options.isolated,
        mcpServers: plugin.mcpServers,
        serverName: server.name,
        tools: Object.keys(server.tools).length,
        allToolsAppOnly: true,
        globalEntrypoint: true,
        resourceUri: metadata.ui.resourceUri,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const related = diagnostics
    .split('\n')
    .filter((line) => /arknights|Agent Plugins/.test(line))
    .slice(-3);
  if (related.length) console.error(related.join('\n'));
  throw error;
} finally {
  lines.close();
  child.stdin.end();
  child.kill();
}
