import { useEffect, useState } from 'react';
import type { ReaderTransport } from '../transport.js';

export function StoryIntro({
  storyId,
  transport,
}: {
  storyId: string;
  transport: ReaderTransport;
}) {
  const [info, setInfo] = useState<{
    summary?: string;
    sourceUrl?: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    void transport
      .call('reader_story_info', { storyId, refresh: attempt > 0 })
      .then((value) => {
        if (active) setInfo(value);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : '剧情简介加载失败。',
          );
      });
    return () => {
      active = false;
    };
  }, [storyId, transport, attempt]);
  if (error)
    return (
      <div className="story-intro-error" role="status">
        <span>{error}</span>{' '}
        <button onClick={() => setAttempt((n) => n + 1)}>重试剧情简介</button>
      </div>
    );
  if (!info)
    return (
      <p className="muted story-intro-loading" role="status">
        正在读取剧情简介…
      </p>
    );
  if (!info.summary) return null;
  return (
    <div className="story-intro">
      <p>{info.summary}</p>
      {info.sourceUrl && (
        <a href={info.sourceUrl} target="_blank" rel="noreferrer">
          PRTS 简介来源 ↗
        </a>
      )}
    </div>
  );
}
