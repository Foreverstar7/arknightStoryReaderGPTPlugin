import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  Chapter,
  ReadingRecord,
  RecordInput,
} from '../shared/contracts.js';
import { chapterContentKind } from '../domain/reading.js';
import { createPositionSaveQueue } from './position-save-queue.js';

/** DOM observation/restoration and its save lifetime belong to one reader mount. */
export function useReadingPosition({
  chapter,
  initialPosition,
  save,
  registerFlush,
}: {
  chapter: Chapter;
  initialPosition?: ReadingRecord['last'];
  save: (input: RecordInput) => Promise<void>;
  registerFlush: (flush: () => Promise<void>) => void;
}) {
  const scroll = useRef<HTMLElement>(null);
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const [flushPosition] = useState(() =>
    createPositionSaveQueue((input) => saveRef.current(input)),
  );

  useLayoutEffect(() => {
    const element = scroll.current;
    const node = initialPosition
      ? nodes.current.get(initialPosition.blockId)
      : undefined;
    if (element && node && initialPosition) {
      element.scrollTop =
        initialPosition.blockId === chapter.blocks[0]?.id &&
        initialPosition.fraction === 0
          ? 0
          : node.offsetTop + node.offsetHeight * initialPosition.fraction;
    }
  }, [initialPosition]);

  useEffect(() => {
    function position(): RecordInput | null {
      if (chapterContentKind(chapter) === 'video') return null;
      const element = scroll.current;
      if (!element) return null;
      const end = chapter.blocks.at(-1);
      const endNode = end ? nodes.current.get(end.id) : undefined;
      const atEnd = Boolean(
        endNode &&
        endNode.getBoundingClientRect().bottom <=
          element.getBoundingClientRect().bottom + 1,
      );
      if (atEnd && end)
        return {
          chapterId: chapter.id,
          revision: chapter.revision,
          historyToken: chapter.historyToken,
          last: { blockId: end.id, fraction: 1 },
          atEnd: true,
        };
      // Reading is estimated at the top edge, avoiding credit for unseen content below the fold.
      const point = element.scrollTop;
      let block = chapter.blocks[0];
      for (const item of chapter.blocks) {
        const node = nodes.current.get(item.id);
        if (node && node.offsetTop <= point + 1) block = item;
      }
      if (!block) return null;
      const node = nodes.current.get(block.id);
      const fraction = node
        ? Math.max(
            0,
            Math.min(
              1,
              (point - node.offsetTop) / Math.max(node.offsetHeight, 1),
            ),
          )
        : 0;
      return {
        chapterId: chapter.id,
        revision: chapter.revision,
        historyToken: chapter.historyToken,
        last: { blockId: block.id, fraction },
        atEnd: false,
      };
    }
    async function flush() {
      if (timer.current) clearTimeout(timer.current);
      await flushPosition(position());
    }
    function schedule() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 250);
    }
    function visibility() {
      if (document.visibilityState === 'hidden') void flush();
    }
    const element = scroll.current;
    element?.addEventListener('scroll', schedule, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('reader:flush', flush);
    registerFlush(flush);
    void flush();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      element?.removeEventListener('scroll', schedule);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('reader:flush', flush);
      registerFlush(async () => undefined);
    };
  }, [chapter, registerFlush, flushPosition]);

  return { scroll, nodes };
}
