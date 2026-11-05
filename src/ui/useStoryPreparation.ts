import { useEffect, useRef, useState } from 'react';
import { type ChapterCount, type Story } from '../shared/contracts.js';
import type { ReaderTransport } from './transport.js';

export type StoryPreparation = {
  storyId: string;
  total: number;
  loaded: number;
  phase: 'loading' | 'ready' | 'failed' | 'paused';
  failures: { chapterId: string; message: string }[];
};

/** Two text requests at a time; leaving the story or clearing cache stops queued work. */
export function useStoryPreparation(
  story: Story | undefined,
  transport: ReaderTransport,
  onCount: (count: ChapterCount) => void,
) {
  const [status, setStatus] = useState<StoryPreparation | null>(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const update = useRef(onCount);
  update.current = onCount;
  const storyId = story?.id;
  const chapterKey = story?.chapters.map((chapter) => chapter.id).join('\0');
  useEffect(() => {
    const run = ++generation.current;
    if (!storyId || chapterKey === undefined) return;
    const chapters = chapterKey.split('\0').filter(Boolean);
    let cursor = 0;
    let loaded = 0;
    const failures: StoryPreparation['failures'] = [];
    const active = () => generation.current === run;
    const publish = (phase: StoryPreparation['phase']) => {
      if (active())
        setStatus({
          storyId,
          total: chapters.length,
          loaded,
          failures: [...failures],
          phase,
        });
    };
    publish('loading');
    async function worker() {
      while (active()) {
        const chapterId = chapters[cursor++];
        if (!chapterId) return;
        try {
          const count = await transport.call('reader_prepare_chapter', {
            chapterId,
          });
          if (!active()) return;
          if (count.storyId !== storyId)
            throw new Error('正文统计返回了不同的篇目。');
          update.current(count);
          loaded++;
        } catch (error) {
          if (!active()) return;
          failures.push({
            chapterId,
            message: error instanceof Error ? error.message : '正文加载失败',
          });
        }
        publish('loading');
      }
    }
    void Promise.all([worker(), worker()]).then(() =>
      publish(failures.length ? 'failed' : 'ready'),
    );
    return () => {
      ++generation.current;
    };
  }, [storyId, chapterKey, transport, attempt]);
  return {
    status: status?.storyId === storyId ? status : null,
    retry: () => setAttempt((value) => value + 1),
    stop: () => {
      ++generation.current;
      setStatus((current) =>
        current ? { ...current, phase: 'paused' } : current,
      );
    },
  };
}
