import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';

export interface Publication {
  name: string;
  version: string;
  integrity: string;
}
type RegistryFetch = (url: string, init: RequestInit) => Promise<Response>;

export async function registeredPackage(
  expected: Publication,
  fetchRegistry: RegistryFetch = fetch,
  timeoutMs = 15_000,
) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(expected.name)}/${expected.version}`;
  const response = await fetchRegistry(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`npm registry 检查失败：HTTP ${response.status}`);
  return z
    .object({
      name: z.literal(expected.name),
      version: z.literal(expected.version),
      dist: z.object({ integrity: z.literal(expected.integrity) }),
    })
    .parse(await response.json());
}

export async function waitForRegisteredPackage(
  expected: Publication,
  options: {
    fetchRegistry?: RegistryFetch;
    now?: () => number;
    delay?: (milliseconds: number) => Promise<void>;
    onPending?: (attempt: number) => void;
  } = {},
) {
  const now = options.now ?? Date.now;
  const delay = options.delay ?? ((milliseconds) => setTimeout(milliseconds));
  // npm accepted 1.1.0 but its validating stage outlasted the old five-minute
  // budget. Allow up to 20 minutes for 404 visibility lag, inside the publish
  // job's 30-minute limit (latest readback keeps its separate five minutes).
  // This is our operational cap, not npm's SLA; recheck against real release
  // timings when changing it. HTTP, decoding and integrity errors still fail.
  const deadline = now() + 20 * 60_000;
  let attempt = 0;
  while (true) {
    const requestBudget = deadline - now();
    if (requestBudget <= 0) break;
    const published = await registeredPackage(
      expected,
      options.fetchRegistry,
      Math.min(15_000, requestBudget),
    );
    if (published) return published;
    options.onPending?.(++attempt);
    const remaining = deadline - now();
    if (remaining > 0) await delay(Math.min(10_000, remaining));
  }
  throw new Error(
    'npm 发布命令已结束，但 registry 在 20 分钟内仍未返回该版本；请核对发布日志和暂存记录，不更新稳定来源。',
  );
}
