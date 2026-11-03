import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  Block,
  Chapter,
  ReadingRecord,
  RecordInput,
  Story,
} from '../../shared/contracts.js';
import type { ReaderTransport } from '../transport.js';
import { SourceImage, useVisible } from './SourceImage.js';
import { PortraitPopover } from './PortraitPopover.js';

function Cg({
  block,
  chapter,
  autoImages,
  transport,
}: {
  block: Extract<Block, { kind: 'cg' }>;
  chapter: Chapter;
  autoImages: boolean;
  transport: ReaderTransport;
}) {
  const { ref, seen } = useVisible<HTMLDivElement>(autoImages, '240px 0px');
  const [manual, setManual] = useState<boolean | null>(null);
  const shown = manual ?? (autoImages && seen);
  return (
    <div className="cg-wrap" ref={ref}>
      <button aria-expanded={shown} onClick={() => setManual(!shown)}>
        ◇ {shown ? '收起 CG' : '查看 CG'}
      </button>
      {shown &&
        (chapter.source === 'fixture' ? (
          <div className="cg-art" role="img" aria-label={block.label}>
            <span>{block.label}</span>
          </div>
        ) : (
          <div className="cg-image">
            <SourceImage
              input={{ kind: 'cg', chapterId: chapter.id, blockId: block.id }}
              transport={transport}
              label={block.label}
            />
          </div>
        ))}
    </div>
  );
}

type Position = ReadingRecord['last'];
interface ReaderProps {
  story: Story;
  chapter: Chapter;
  initialPosition?: Position;
  autoImages: boolean;
  open: (id: string, restore: boolean, direction?: 'next' | 'previous') => void;
  save: (input: RecordInput) => Promise<void>;
  registerFlush: (flush: () => Promise<void>) => void;
  transport: ReaderTransport;
}

export function Reader({
  story,
  chapter,
  initialPosition,
  autoImages,
  open,
  save,
  registerFlush,
  transport,
}: ReaderProps) {
  const scroll = useRef<HTMLElement>(null);
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const [sidebar, setSidebar] = useState(false);
  const [portrait, setPortrait] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const lastSaved = useRef('');
  const saveRef = useRef(save);
  saveRef.current = save;

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
        last: { blockId: block.id, fraction },
        atEnd: false,
      };
    }
    async function flush() {
      if (timer.current) clearTimeout(timer.current);
      const input = position();
      if (!input || JSON.stringify(input) === lastSaved.current) {
        await saving.current;
        return;
      }
      const fingerprint = JSON.stringify(input);
      saving.current = saving.current
        .catch(() => undefined)
        .then(() => saveRef.current(input));
      try {
        await saving.current;
        lastSaved.current = fingerprint;
      } catch {
        /* Parent displays a retryable error. */
      }
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
  }, [chapter, registerFlush]);

  useEffect(() => {
    if (!portrait) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPortrait(null);
        document.getElementById(`name-${portrait}`)?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        document.getElementById(`name-${portrait}`)?.contains(target) ||
        document.querySelector('.portrait')?.contains(target)
      )
        return;
      setPortrait(null);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', outside);
    };
  }, [portrait]);

  function showBlock(block: Block) {
    switch (block.kind) {
      case 'narration':
        return <p className="narration">{block.text}</p>;
      case 'speech':
        return (
          <div className="speech">
            <div className="namebox">
              <button
                id={`name-${block.id}`}
                className="name"
                aria-expanded={portrait === block.id}
                aria-label={`查看 ${block.name} 的立绘`}
                onMouseEnter={() => {
                  if (autoImages) setPortrait(block.id);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setPortrait(portrait === block.id ? null : block.id);
                }}
                aria-describedby={`hint-${block.id}`}
              >
                {block.name}
              </button>
              <span className="name-hint" id={`hint-${block.id}`}>
                点击查看立绘
              </span>
              {portrait === block.id && (
                <PortraitPopover
                  anchorId={`name-${block.id}`}
                  label={`${block.name} 立绘`}
                >
                  <div className="portrait-head">
                    <span>{block.name}</span>
                    <button
                      autoFocus={!autoImages}
                      onClick={() => {
                        setPortrait(null);
                        document.getElementById(`name-${block.id}`)?.focus();
                      }}
                      aria-label="关闭立绘"
                    >
                      ×
                    </button>
                  </div>
                  {chapter.source === 'fixture' && block.portrait ? (
                    <>
                      <div className="portrait-art" />
                      <p className="muted">原创立绘位置示意</p>
                    </>
                  ) : chapter.source === 'prts' ? (
                    <div className="portrait-image">
                      <SourceImage
                        input={{
                          kind: 'portrait',
                          chapterId: chapter.id,
                          blockId: block.id,
                        }}
                        transport={transport}
                        label={`${block.name} · 当前场景立绘`}
                      />
                      <p className="muted">
                        按此处场景资源显示，姓名保持原文。
                      </p>
                    </div>
                  ) : (
                    <p className="muted">没有可确认的立绘资源。</p>
                  )}
                </PortraitPopover>
              )}
            </div>
            <div>
              {block.paragraphs.map((text, index) => (
                <p key={index}>{text}</p>
              ))}
            </div>
          </div>
        );
      case 'cg':
        return (
          <Cg
            block={block}
            chapter={chapter}
            autoImages={autoImages}
            transport={transport}
          />
        );
      case 'choices':
        return (
          <div className="choices">
            <h3>选项 / 全部分支</h3>
            {block.options.map((option, index) => (
              <section key={index}>
                <p className="option">{option.label}</p>
                {option.blocks.map((item) => (
                  <div key={item.id}>{showBlock(item)}</div>
                ))}
              </section>
            ))}
            {block.shared?.map((group, index) => (
              <section key={`shared-${index}`}>
                <p className="option">共同分支：{group.labels.join(' / ')}</p>
                {group.blocks.map((item) => (
                  <div key={item.id}>{showBlock(item)}</div>
                ))}
              </section>
            ))}
          </div>
        );
    }
  }
  const currentIndex = story.chapters.findIndex(
    (item) => item.id === chapter.id,
  );
  const previous = story.chapters[currentIndex - 1];
  const next = story.chapters[currentIndex + 1];
  return (
    <div className="reader-layout page" onClick={() => setPortrait(null)}>
      <button
        className="index-toggle"
        aria-expanded={sidebar}
        aria-controls="reading-index"
        onClick={() => setSidebar(!sidebar)}
      >
        ☰ 篇目列表
      </button>
      <aside
        className={`reading-index ${sidebar ? 'is-open' : ''}`}
        id="reading-index"
        aria-label="当前剧情篇目"
      >
        <h2>{story.title}</h2>
        {story.chapters.map((meta) => (
          <button
            key={meta.id}
            aria-current={meta.id === chapter.id ? 'page' : undefined}
            onClick={() => {
              setSidebar(false);
              open(meta.id, false);
            }}
          >
            <span>{meta.code}</span>
            <strong>{meta.title}</strong>
          </button>
        ))}
      </aside>
      <main
        className="reader-scroll"
        ref={scroll}
        tabIndex={0}
        aria-label="剧情正文"
      >
        <article className="reading-copy">
          <header className="reading-heading">
            <span className="eyebrow">
              STORY / {story.chapters[currentIndex]?.code}
            </span>
            <h1>{chapter.title}</h1>
            <p className="muted">
              {story.title} ·{' '}
              {chapter.source === 'prts' ? (
                <a href={chapter.sourceUrl} target="_blank" rel="noreferrer">
                  PRTS 原文
                </a>
              ) : (
                '原创 fixture'
              )}
            </p>
          </header>
          <div className="body-copy">
            {chapter.blocks.map((block) => (
              <div
                className="body-block"
                key={block.id}
                data-block={block.id}
                ref={(node) => {
                  if (node) nodes.current.set(block.id, node);
                }}
              >
                {showBlock(block)}
              </div>
            ))}
          </div>
          <footer className="reader-end">
            <button
              disabled={!previous}
              onClick={() => {
                if (previous) open(previous.id, false, 'previous');
              }}
            >
              ← 上一篇
            </button>
            <span>本篇结束</span>
            <button
              disabled={!next}
              onClick={() => {
                if (next) open(next.id, false, 'next');
              }}
            >
              下一篇 →
            </button>
          </footer>
        </article>
      </main>
    </div>
  );
}
