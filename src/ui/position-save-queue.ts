import type { RecordInput } from '../shared/contracts.js';

/** Serial, deduplicated saves for one mounted reader. The caller reports errors;
 * a rejected save stays retryable and does not poison the next queued position. */
export function createPositionSaveQueue(
  save: (input: RecordInput) => Promise<void>,
) {
  let saving: Promise<void> = Promise.resolve();
  let lastSaved = '';
  let lastQueued = '';
  let sequence = 0;
  return async function flush(input: RecordInput | null) {
    const fingerprint = input ? JSON.stringify(input) : '';
    if (input && fingerprint !== (lastQueued || lastSaved)) {
      const queued = ++sequence;
      lastQueued = fingerprint;
      saving = saving
        .catch(() => undefined) // Already reported by save; permit an explicit retry.
        .then(async () => {
          try {
            await save(input);
            lastSaved = fingerprint;
          } finally {
            if (sequence === queued) lastQueued = '';
          }
        });
    }
    // Restoration may enqueue a scroll while navigation is awaiting IO.
    // Even a failed predecessor must not release a flush before the later save.
    let pending;
    do {
      pending = saving;
      try {
        await pending;
      } catch {
        // ReaderApp owns the visible failure and retry action; keep draining.
      }
    } while (pending !== saving);
  };
}
