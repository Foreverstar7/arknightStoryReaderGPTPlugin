import { useEffect, useRef, useState } from 'react';
import type { ReadingState, Settings, Story } from '../../shared/contracts.js';

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
          <label className="setting-row">
            自动显示图片
            <input
              type="checkbox"
              checked={draft.autoImages}
              onChange={(event) =>
                preference(
                  { ...draft, autoImages: event.target.checked },
                  '已保存图片显示设置。',
                )
              }
            />
          </label>
          <label className="setting-row">
            主题
            <select
              value={draft.theme}
              onChange={(event) => {
                const theme = event.target.value;
                if (theme === 'system' || theme === 'light' || theme === 'dark')
                  preference({ ...draft, theme }, '已保存主题。');
              }}
            >
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
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
          <h3>缓存管理</h3>
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
            清理全部内容缓存
          </button>
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
          <button
            className="panel-action"
            disabled={recent.length === 0}
            onClick={() => setConfirmClear(true)}
          >
            清除阅读记录
          </button>
          {confirmClear && (
            <div className="clear-confirm">
              <p>清除续读位置和全部阅读进度？内容缓存会保留。</p>
              <button
                onClick={() =>
                  void perform(async () => {
                    await clearHistory();
                    setConfirmClear(false);
                  }, '阅读记录已清除。')
                }
              >
                确认清除
              </button>
              <button onClick={() => setConfirmClear(false)}>取消</button>
            </div>
          )}
        </fieldset>
        <p className="panel-message" role="status">
          {message}
        </p>
      </div>
    </dialog>
  );
}
