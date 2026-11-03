import { useEffect, useRef, useState } from 'react';
import type { ReadingState, Settings, Story } from '../../shared/contracts.js';

function Toggle({
  label,
  checked,
  disabled,
  change,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  change: (checked: boolean) => void;
}) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <button
        type="button"
        className="setting-toggle"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => change(!checked)}
      >
        <span className="toggle-track" aria-hidden="true">
          <span className="toggle-thumb" />
        </span>
        <span aria-hidden="true">{checked ? '开启' : '关闭'}</span>
      </button>
    </div>
  );
}

function useSystemDark() {
  const read = () => {
    const host = document.documentElement.dataset.hostTheme;
    return (
      host === 'dark' ||
      (host !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
    );
  };
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setDark(read());
    media.addEventListener('change', update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-host-theme'],
    });
    return () => {
      media.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);
  return dark;
}

interface Props {
  state: ReadingState;
  stories: Story[];
  environment: string;
  close: () => void;
  update: (settings: Settings) => Promise<void>;
  clearCache: (scope: 'images' | 'all') => Promise<void>;
  clearHistory: () => Promise<void>;
  refresh?: () => Promise<void>;
  resume: (id: string) => void;
}
export function SettingsPanel({
  state,
  stories,
  environment,
  close,
  update,
  clearCache,
  clearHistory,
  refresh,
  resume,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [draft, setDraft] = useState(state.settings);
  const systemDark = useSystemDark();
  useEffect(() => {
    setDraft(state.settings);
  }, [
    state.settings.autoImages,
    state.settings.retentionDays,
    state.settings.theme,
  ]);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function perform(action: () => Promise<void>, success: string) {
    setBusy(true);
    try {
      await action();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败，请重试。');
    } finally {
      setBusy(false);
    }
  }
  function preference(settings: Settings, success: string) {
    setDraft(settings);
    void perform(async () => {
      try {
        await update(settings);
      } catch (error) {
        setDraft(state.settings);
        throw error;
      }
    }, success);
  }
  const recent = Object.values(state.records).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  return (
    <dialog
      className="settings-panel"
      ref={dialog}
      aria-label="阅读设置"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="panel-inner">
        <div className="panel-heading">
          <h2>阅读设置</h2>
          <button aria-label="关闭设置" onClick={close}>
            ×
          </button>
        </div>
        <p className="environment">
          {environment}
          <br />
          {stories.some((story) => story.source === 'prts')
            ? 'PRTS 真实剧情 · 本机缓存与阅读记录'
            : '原创 fixture · 非游戏剧情'}
        </p>
        <h3>阅读偏好</h3>
        <fieldset disabled={busy}>
          <Toggle
            label="自动显示图片"
            checked={draft.autoImages}
            change={(autoImages) =>
              preference({ ...draft, autoImages }, '已保存图片显示设置。')
            }
          />
          <Toggle
            label="主题跟随系统"
            checked={draft.theme === 'system'}
            change={(follow) =>
              preference(
                {
                  ...draft,
                  theme: follow ? 'system' : systemDark ? 'dark' : 'light',
                },
                '已保存主题。',
              )
            }
          />
          <Toggle
            label="深色模式"
            checked={
              draft.theme === 'system' ? systemDark : draft.theme === 'dark'
            }
            disabled={draft.theme === 'system'}
            change={(dark) =>
              preference(
                { ...draft, theme: dark ? 'dark' : 'light' },
                '已保存主题。',
              )
            }
          />
          <p className="data-help muted">
            {draft.theme === 'system'
              ? '当前跟随系统。关闭跟随后可切换深色模式。'
              : '深色模式关闭时使用浅色主题。'}
          </p>
          <label className="setting-row">
            缓存保留期
            <select
              value={draft.retentionDays}
              onChange={(event) =>
                preference(
                  { ...draft, retentionDays: Number(event.target.value) },
                  '已保存缓存保留期。',
                )
              }
            >
              {[
                1,
                7,
                14,
                30,
                ...([1, 7, 14, 30].includes(state.settings.retentionDays)
                  ? []
                  : [state.settings.retentionDays]),
              ].map((days) => (
                <option key={days} value={days}>
                  {days} 天未使用
                </option>
              ))}
            </select>
          </label>
          <h3>当前篇目</h3>
          <button
            className="panel-action"
            disabled={!refresh}
            onClick={() => {
              if (refresh) void perform(refresh, '本章正文已刷新。');
            }}
          >
            刷新本章 ↻
          </button>
          <h3>数据管理</h3>
          <button
            className="panel-action"
            onClick={() =>
              void perform(
                () => clearCache('images'),
                '图片缓存已清理，阅读记录已保留。',
              )
            }
          >
            清理图片缓存
          </button>
          <button
            className="panel-action"
            onClick={() =>
              void perform(
                () => clearCache('all'),
                '内容缓存已清理，阅读记录已保留。',
              )
            }
          >
            清理剧情文本和图片缓存
          </button>
          <p className="data-help muted">
            同时清理人物及资源映射。保留阅读记录、设置和已核验的字数统计。
          </p>
          <button
            className="panel-action"
            disabled={recent.length === 0}
            onClick={() => setConfirmClear(true)}
            aria-expanded={confirmClear}
          >
            清除全部阅读记录
          </button>
          <p className="data-help muted">
            重置所有剧情的阅读进度、续读位置和最近阅读，保留内容缓存。
          </p>
          {confirmClear && (
            <div
              className="clear-confirm"
              role="group"
              aria-label="确认清除全部阅读记录"
            >
              <p>
                确定清除所有剧情的阅读记录？此操作无法撤销，内容缓存和字数统计会保留。
              </p>
              <button
                onClick={() =>
                  void perform(async () => {
                    await clearHistory();
                    setConfirmClear(false);
                  }, '全部阅读记录已清除。')
                }
              >
                确认清除全部
              </button>
              <button onClick={() => setConfirmClear(false)}>取消</button>
            </div>
          )}
          <h3>最近阅读</h3>
          {recent.length === 0 && <p className="muted">还没有阅读记录。</p>}
          {recent.map((record) => {
            const story = stories.find((story) => story.id === record.storyId);
            const chapter = story?.chapters.find(
              (chapter) => chapter.id === record.chapterId,
            );
            return (
              <button
                className="history-item"
                key={record.chapterId}
                onClick={() => {
                  close();
                  resume(record.chapterId);
                }}
              >
                <span>{story?.title ?? record.storyId}</span>
                <strong>{chapter?.title ?? record.chapterId}</strong>
              </button>
            );
          })}
        </fieldset>
        <p className="panel-message" role="status">
          {message}
        </p>
      </div>
    </dialog>
  );
}
