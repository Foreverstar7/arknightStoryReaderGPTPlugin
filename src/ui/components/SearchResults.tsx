import type { SearchResult, SearchCard } from '../../shared/search.js';
import type { ReaderTransport } from '../transport.js';
import type { Story } from '../../shared/contracts.js';
import { Cover } from './Library.js';

export function SearchCardView({
  card,
  transport,
  open,
}: {
  card: SearchCard;
  transport: ReaderTransport;
  open: (id: string) => void;
}) {
  const story: Story = { ...card, coverLabel: card.title, chapters: [] };
  return (
    <article className="search-card">
      <Cover story={story} transport={transport} />
      <button
        className="search-card-open"
        onClick={() => open(card.id)}
        aria-label={`查看《${card.title}》篇章目录`}
      >
        <span className="eyebrow">
          {card.type} · {card.chapterCount} 篇
        </span>
        <strong>{card.title}</strong>
        {card.matchedChapters.length > 0 && (
          <span className="muted">
            命中 {card.matchedChapters.length} 篇 ·{' '}
            {card.matchedQueries.join('、')}
          </span>
        )}
        <span className="search-card-action">查看篇章目录 →</span>
      </button>
    </article>
  );
}
export function SearchResults({
  result,
  transport,
  open,
  more,
  refreshing,
  refresh,
}: {
  result: SearchResult;
  transport: ReaderTransport;
  open: (id: string) => void;
  more?: () => void;
  refreshing?: boolean;
  refresh?: () => void;
}) {
  return (
    <main className="search-results" aria-label="剧情搜索结果">
      <div className="search-heading">
        <h1>剧情搜索</h1>
        <p role="status">
          {result.queries.join('、')} · 找到 {result.total} 部剧情
        </p>
        {result.by === 'character' && (
          <p className="muted">按来源资料收录的实际出场匹配。</p>
        )}
        {refresh && (
          <button onClick={refresh} disabled={refreshing}>
            {refreshing ? '正在刷新…' : '刷新搜索资料'}
          </button>
        )}
      </div>
      {result.total === 0 && (
        <p className="search-empty">
          当前资料未找到相关剧情。可以换用正式剧情名、篇目编号或人物姓名。
        </p>
      )}
      {result.unmatchedQueries.length > 0 && result.total > 0 && (
        <p className="muted">
          当前资料未找到：{result.unmatchedQueries.join('、')}
        </p>
      )}
      <div className="search-grid">
        {result.results.map((card) => (
          <SearchCardView
            key={card.id}
            card={card}
            transport={transport}
            open={open}
          />
        ))}
      </div>
      {result.hasMore && more && (
        <button onClick={more} disabled={refreshing}>
          查看更多结果
        </button>
      )}
    </main>
  );
}
