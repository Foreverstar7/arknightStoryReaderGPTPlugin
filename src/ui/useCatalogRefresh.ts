import { useCallback, useEffect, useRef, useState } from 'react';
import { snapshotSchema, type Snapshot } from '../shared/contracts.js';
import type { ReaderTransport } from './transport.js';

export type CatalogRefreshStatus =
  | { phase: 'idle' | 'loading' | 'ready' }
  | { phase: 'failed'; message: string };

/** One refresh per open/manual action; route changes do not start requests. */
export function useCatalogRefresh(
  transport: ReaderTransport,
  onCatalog: (snapshot: Snapshot) => void,
) {
  const [status, setStatus] = useState<CatalogRefreshStatus>({ phase: 'idle' });
  const pending = useRef<Promise<Snapshot | null> | null>(null);
  const generation = useRef(0);
  const accept = useRef(onCatalog);
  accept.current = onCatalog;
  useEffect(
    () => () => {
      ++generation.current;
      pending.current = null;
    },
    [transport],
  );
  const refresh = useCallback(() => {
    if (pending.current) return pending.current;
    const run = generation.current;
    setStatus({ phase: 'loading' });
    const task = transport
      .call('reader_snapshot', { refreshCatalog: true })
      .then((value) => {
        const data = snapshotSchema.parse(value);
        if (generation.current !== run) return null;
        accept.current(data);
        setStatus({ phase: 'ready' });
        return data;
      })
      .catch((error: unknown) => {
        if (generation.current === run)
          setStatus({
            phase: 'failed',
            message: error instanceof Error ? error.message : '请稍后重试。',
          });
        return null;
      })
      .finally(() => {
        if (generation.current === run) pending.current = null;
      });
    pending.current = task;
    return task;
  }, [transport]);
  return {
    status,
    refresh,
    cancel: () => {
      ++generation.current;
      pending.current = null;
      setStatus({ phase: 'idle' });
    },
  };
}
