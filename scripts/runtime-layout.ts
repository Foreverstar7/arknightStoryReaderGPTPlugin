import { z } from 'zod';

// Official Node archive names/layouts: https://nodejs.org/dist/ (SHASUMS256.txt).
// Recheck these six targets when changing .node-version; other targets fail explicitly.
export function runtimeLayout(
  version: string,
  platform: string = process.platform,
  arch: string = process.arch,
) {
  z.string()
    .regex(/^\d+\.\d+\.\d+$/)
    .parse(version);
  z.enum(['win32', 'darwin', 'linux']).parse(platform);
  z.enum(['x64', 'arm64']).parse(arch);
  const windows = platform === 'win32';
  const executable = windows ? 'node.exe' : 'node';
  return {
    distribution: `node-v${version}-${windows ? 'win' : platform}-${arch}`,
    executable,
    sourceExecutable: windows ? executable : `bin/${executable}`,
    command: `./runtime/${executable}`,
  };
}
