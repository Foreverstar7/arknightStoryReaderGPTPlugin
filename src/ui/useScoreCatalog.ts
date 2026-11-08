import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScoreCatalog } from '../shared/score.js';
import type { ReaderTransport } from './transport.js';

export type ScoreViewState = {
  phase: 'idle' | 'loading' | 'ready' | 'failed' | 'unavailable';
  data?: ScoreCatalog;
  message?: string;
};
/** Independent metadata loading never blocks catalog reading or overwrites the
 * current private records with a late snapshot used only to obtain score data. */
export function useScoreCatalog(
  transport: ReaderTransport,
  ready: boolean,
  revision: number,
) {
  const [state, setState] = useState<ScoreViewState>({ phase: 'idle' });
  const generation = useRef(0);
  const load = useCallback(
    async (refresh = false) => {
      const run = ++generation.current;
      setState((current) => ({
        ...current,
        phase: 'loading',
        message: undefined,
      }));
      try {
        const snapshot = await transport.call('reader_snapshot', {
          includeScore: true,
          refreshScore: refresh,
        });
        if (generation.current !== run) return;
        const result = snapshot.score;
        if (result?.status === 'ready')
          setState({ phase: 'ready', data: result.data });
        else if (result?.status === 'failed')
          setState((current) => ({
            ...current,
            phase: 'failed',
            message: result.message,
          }));
        else setState({ phase: 'unavailable' });
      } catch (error) {
        if (generation.current === run)
          setState((current) => ({
            ...current,
            phase: 'failed',
            message:
              error instanceof Error
                ? error.message
                : '乐章资料加载失败，请重试。',
          }));
      }
    },
    [transport],
  );
  useEffect(() => {
    if (ready) void load(revision > 0);
    return () => {
      ++generation.current;
    };
  }, [load, ready, revision]);
  return { state, refresh: () => void load(true) };
}
