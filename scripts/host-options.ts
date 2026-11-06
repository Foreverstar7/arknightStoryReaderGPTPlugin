import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';

export async function hostOptions(args: string[], projectRoot: string) {
  const { values } = parseArgs({
    args,
    options: {
      marketplace: { type: 'string', default: '.local/marketplace' },
      plugin: { type: 'string', default: 'arknights-story-reader' },
      isolated: { type: 'boolean', default: false },
    },
  });
  const input = path.resolve(projectRoot, values.marketplace);
  const marketplacePath = (await stat(input)).isDirectory()
    ? path.join(input, '.agents/plugins/marketplace.json')
    : input;
  const catalog = z
    .object({
      name: z.string(),
      plugins: z.array(z.object({ name: z.string() }).passthrough()),
    })
    .parse(JSON.parse(await readFile(marketplacePath, 'utf8')));
  if (!catalog.plugins.some((plugin) => plugin.name === values.plugin))
    throw new Error('marketplace 没有指定插件；未发布的稳定来源保持为空。');
  return {
    marketplacePath,
    marketplaceRoot: path.resolve(marketplacePath, '../../..'),
    pluginName: values.plugin,
    pluginId: `${values.plugin}@${catalog.name}`,
    isolated: values.isolated,
  };
}
