import { useEffect, useRef, useState } from 'react';
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
import { useReadingPosition } from '../useReadingPosition.js';
import { useChapterSwipe } from '../useChapterSwipe.js';
import { Icon } from './Icon.js';

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
        {block.composition?.fit === 'layers' ? ' 图层' : ''}
      </button>
      {shown &&
        (chapter.source === 'fixture' && !chapter.imagesAvailable ? (
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
  busy?: boolean;
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
  busy = false,
}: ReaderProps) {
  const { scroll, nodes } = useReadingPosition({
    chapter,
    initialPosition,
    save,
    registerFlush,
  });
  const [sidebar, setSidebar] = useState(false);
  const [hint, setHint] = useState(() => {
    try {
      return sessionStorage.getItem('reader-swipe-hint') !== 'dismissed';
    } catch {
      return true;
    }
  });
  function dismissHint() {
    setHint(false);
    try {
      sessionStorage.setItem('reader-swipe-hint', 'dismissed');
    } catch {
      /* Session storage is optional in embedded hosts. */
    }
  }
  const [portrait, setPortrait] = useState<{
    blockId: string;
    hover: boolean;
  } | null>(null);
  const currentIndex = story.chapters.findIndex(
    (item) => item.id === chapter.id,
  );
  const previous = story.chapters[currentIndex - 1];
  const next = story.chapters[currentIndex + 1];
  const swipe = useChapterSwipe(
    scroll,
    previous,
    next,
    (id, restore, direction) => {
      dismissHint();
      open(id, restore, direction);
    },
    busy || sidebar || Boolean(portrait),
  );
  const hoverClose = useRef<ReturnType<typeof setTimeout> | null>(null);
  function keepPortrait() {
    if (hoverClose.current) clearTimeout(hoverClose.current);
  }
  function leavePortrait() {
    keepPortrait();
    // Allow crossing the small gap to the source/retry controls in the portal.
    hoverClose.current = setTimeout(() => {
      setPortrait((current) => (current?.hover ? null : current));
    }, 120);
  }
  useEffect(() => () => keepPortrait(), []);
  useEffect(() => {
    if (!portrait) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPortrait(null);
        document.getElementById(`name-${portrait.blockId}`)?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        document.getElementById(`name-${portrait.blockId}`)?.contains(target) ||
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
      case 'video':
        return (
          <div className="video-source">
            <strong>视频内容</strong>
            <p>此处的源内容为视频。阅读进度只统计文字，不记录视频观看进度。</p>
            <a href={block.sourceUrl} target="_blank" rel="noreferrer">
              前往 PRTS 查看视频 ↗
            </a>
          </div>
        );
      case 'narration':
        return <p className="narration">{block.text}</p>;
      case 'speech':
        return (
          <div className="speech">
            <div
              className="namebox"
              onPointerEnter={keepPortrait}
              onPointerLeave={leavePortrait}
              onBlur={(event) => {
                const next = event.relatedTarget;
                if (
                  next instanceof Node &&
                  (event.currentTarget.contains(next) ||
                    document.querySelector('.portrait')?.contains(next))
                )
                  return;
                setPortrait((current) => (current?.hover ? current : null));
              }}
            >
              <button
                id={`name-${block.id}`}
                className="name"
                aria-expanded={portrait?.blockId === block.id}
                aria-label={`查看 ${block.name} 的立绘`}
                onPointerEnter={(event) => {
                  keepPortrait();
                  if (event.pointerType === 'mouse' && autoImages)
                    setPortrait((current) =>
                      current && !current.hover
                        ? current
                        : { blockId: block.id, hover: true },
                    );
                }}
                onPointerLeave={leavePortrait}
                onClick={(event) => {
                  event.stopPropagation();
                  keepPortrait();
                  setPortrait(
                    portrait?.blockId === block.id && !portrait.hover
                      ? null
                      : { blockId: block.id, hover: false },
                  );
                }}
              >
                {block.name}
              </button>
              {portrait?.blockId === block.id && (
                <PortraitPopover
                  anchorId={`name-${block.id}`}
                  label={`${block.name} 立绘`}
                  focusOnOpen={!portrait.hover}
                  keepOpen={keepPortrait}
                  leave={leavePortrait}
                >
                  {chapter.source === 'fixture' &&
                  !chapter.imagesAvailable &&
                  block.portrait ? (
                    <>
                      <div className="portrait-art" />
                      <p className="muted">原创立绘位置示意</p>
                    </>
                  ) : chapter.source === 'prts' || chapter.imagesAvailable ? (
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
            <h3>{block.options.length ? '选项 / 全部分支' : '分支内容'}</h3>
            {block.when && (
              <p className="branch-condition">
                选择 {block.when.join(' / ')} 后：
              </p>
            )}
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
                <p className="option">
                  {group.labels.length === 1 ? '分支' : '共同分支'}：
                  {group.labels.join(' / ')}
                </p>
                {group.blocks.map((item) => (
                  <div key={item.id}>{showBlock(item)}</div>
                ))}
              </section>
            ))}
          </div>
        );
    }
  }
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
        <div className="reading-turn-zones">
          <button
            className="reader-side-turn reader-side-previous"
            aria-label={`向前阅读${previous ? `：${previous.title}` : ''}`}
            disabled={!previous || busy}
            onClick={(event) => {
              if (
                previous &&
                (event.detail === 0 || !window.getSelection()?.toString())
              )
                open(previous.id, false, 'previous');
            }}
          >
            <Icon name="previous" />
          </button>
          <button
            className="reader-side-turn reader-side-next"
            aria-label={`向后阅读${next ? `：${next.title}` : ''}`}
            disabled={!next || busy}
            onClick={(event) => {
              if (
                next &&
                (event.detail === 0 || !window.getSelection()?.toString())
              )
                open(next.id, false, 'next');
            }}
          >
            <Icon name="next" />
          </button>
        </div>
        <article className="reading-copy">
          {hint && (
            <div className="swipe-hint">
              左右滑动切换篇目，松手前可查看目标；也可使用顶部箭头。
              <button aria-label="关闭滑动提示" onClick={dismissHint}>
                ×
              </button>
            </div>
          )}
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
          {chapter.diagnostics?.length ? (
            <details className="source-diagnostics">
              <summary>来源说明（{chapter.diagnostics.length}）</summary>
              <p>以下源脚本有兼容差异，正文保留；未猜测缺失的选项或人物。</p>
              <ul>
                {chapter.diagnostics.map((item, i) => (
                  <li key={i}>
                    第 {item.line} 行：{item.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
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
            <span>本篇结束</span>
          </footer>
        </article>
      </main>
      {swipe && (
        <div
          className={`swipe-preview${swipe.ready ? ' is-ready' : ''}`}
          role="status"
        >
          <span>{swipe.direction === 'next' ? '← 下一篇' : '上一篇 →'}</span>
          <strong>{swipe.title}</strong>
          <small>{swipe.ready ? '松手切换' : '继续滑动'}</small>
        </div>
      )}
    </div>
  );
}
