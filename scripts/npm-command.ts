import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export async function npmCommand(
  args: string[],
  cwd: string,
  options: { timeoutMs?: number; streamStderr?: boolean } = {},
) {
  const cli = process.env.npm_execpath;
  if (!cli) throw new Error('请通过 npm run 执行，以使用当前固定的 npm CLI。');
  const running = promisify(execFile)(process.execPath, [cli, ...args], {
    cwd,
    maxBuffer: 32 * 1024 * 1024,
    timeout: options.timeoutMs ?? 120_000,
    windowsHide: true,
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    },
  });
  if (options.streamStderr)
    running.child.stderr?.on('data', (chunk) => process.stderr.write(chunk));
  // These commands are non-interactive. MCP owns a separate, direct Node pipe;
  // npm must receive EOF rather than reserve or consume protocol input.
  running.child.stdin?.end();
  return running;
}
