import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const readerManifestSchema = z
  .object({
    mcpServers: z
      .object({
        reader: z
          .object({
            type: z.literal('stdio'),
            command: z.string().min(1),
            args: z.array(z.string()),
            cwd: z.string(),
            env: z.record(z.string(), z.string()).optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

export function resolveReaderLaunch(raw: unknown, root: string) {
  const configuration = readerManifestSchema.parse(raw).mcpServers.reader;
  const expand = (value: string) => value.replaceAll('${PLUGIN_ROOT}', root);
  const command = configuration.command.startsWith('./')
    ? path.resolve(root, configuration.command)
    : configuration.command === 'node'
      ? process.execPath
      : expand(configuration.command);
  return {
    command,
    args: configuration.args.map(expand),
    cwd: path.resolve(root, expand(configuration.cwd)),
    env: Object.fromEntries(
      Object.entries(configuration.env ?? {}).map(([key, value]) => [
        key,
        expand(value),
      ]),
    ),
    packagedRuntime: configuration.command.startsWith('./runtime/'),
  };
}

export async function readReaderLaunch(root: string) {
  return resolveReaderLaunch(
    JSON.parse(await readFile(path.join(root, 'mcp.json'), 'utf8')),
    root,
  );
}
