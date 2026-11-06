import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export async function npmCommand(args: string[], cwd: string) {
  const cli = process.env.npm_execpath;
  if (!cli) throw new Error('请通过 npm run 执行，以使用当前固定的 npm CLI。');
  return promisify(execFile)(process.execPath, [cli, ...args], {
    cwd,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000,
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    },
  });
}
