import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { registeredPackage, type Publication } from './publication-registry.js';

export async function promoteLatest(
  expected: Publication,
  options: {
    updateLatest: () => Promise<void>;
    fetchRegistry?: typeof fetch;
    now?: () => number;
    delay?: (milliseconds: number) => Promise<void>;
    onPending?: (attempt: number) => void;
  },
) {
  const fetchRegistry = options.fetchRegistry ?? fetch;
  if (!(await registeredPackage(expected, fetchRegistry)))
    throw new Error('明确 npm 版本不存在；不更新 latest 或稳定来源。');

  const readLatest = async (timeoutMs: number) => {
    const response = await fetchRegistry(
      `https://registry.npmjs.org/${encodeURIComponent(expected.name)}/latest`,
      {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Cache-Control': 'no-cache' },
      },
    );
    if (response.status === 404) return false;
    if (!response.ok)
      throw new Error(`npm latest 检查失败：HTTP ${response.status}`);
    const current = z
      .object({
        name: z.literal(expected.name),
        version: z.string().min(1),
        dist: z.object({ integrity: z.string().min(1) }),
      })
      .parse(await response.json());
    if (current.version !== expected.version) return false;
    z.literal(expected.integrity).parse(current.dist.integrity);
    return true;
  };
  if (await readLatest(15_000)) return;

  await options.updateLatest();
  const now = options.now ?? Date.now;
  const delay = options.delay ?? ((milliseconds) => setTimeout(milliseconds));
  // Use the publication propagation budget for the tag readback as well. Only
  // an absent or still-old tag is pending; HTTP/JSON/integrity failures abort.
  const deadline = now() + 300_000;
  let attempt = 0;
  while (true) {
    const requestBudget = deadline - now();
    if (requestBudget <= 0) break;
    if (await readLatest(Math.min(15_000, requestBudget))) return;
    options.onPending?.(++attempt);
    const remaining = deadline - now();
    if (remaining > 0) await delay(Math.min(10_000, remaining));
  }
  throw new Error(
    'npm latest 在 5 分钟内未确认目标版本；标签可能已更新，请核对后重跑，不提交稳定目录或公开 Release。',
  );
}
