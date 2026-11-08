import { useEffect, useRef, useState } from 'react';
import type { SettingsPanel as DesktopSettingsPanel } from '../src/ui/components/SettingsPanel.js';
import type { Settings } from '../src/shared/contracts.js';
type Props = Parameters<typeof DesktopSettingsPanel>[0];
function Toggle({
  label,
  checked,
  disabled,
  change,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  change: (value: boolean) => void;
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
/** Web-specific data controls; the desktop settings component is unchanged. */
export function SettingsPanel({
  state,
  stories,
  environment,
  close,
  update,
  clearHistory,
  refresh,
  resume,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const trigger = document.activeElement;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
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
  function preference(settings: Settings) {
    void perform(() => update(settings), '已保存阅读设置。');
  }
  const theme = state.settings.theme;
  const dark = theme === 'system' ? systemDark : theme === 'dark';
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
        <p className="environment">{environment}</p>
        <p className="data-help muted">
          阅读记录和设置仅保存在当前浏览器。正文与图片按需联网读取，不保存离线副本。
        </p>
        <h3>阅读偏好</h3>
        <fieldset disabled={busy}>
          <Toggle
            label="自动显示图片"
            checked={state.settings.autoImages}
            change={(autoImages) =>
              preference({ ...state.settings, autoImages })
            }
          />
          <Toggle
            label="主题跟随系统"
            checked={theme === 'system'}
            change={(follow) =>
              preference({
                ...state.settings,
                theme: follow ? 'system' : dark ? 'dark' : 'light',
              })
            }
          />
          <Toggle
            label="深色模式"
            checked={dark}
            disabled={theme === 'system'}
            change={(value) =>
              preference({ ...state.settings, theme: value ? 'dark' : 'light' })
            }
          />
          {refresh && (
            <button
              className="panel-action"
              onClick={() => void perform(refresh, '已重新读取本章。')}
            >
              刷新本章
            </button>
          )}
          <h3>阅读记录</h3>
          <button
            className="panel-action"
            disabled={!recent.length}
            aria-expanded={confirm}
            onClick={() => setConfirm(true)}
          >
            清除全部阅读记录
          </button>
          <p className="data-help muted">
            清除后重置续读位置和进度，保留阅读设置与字数统计。
          </p>
          {confirm && (
            <div
              className="clear-confirm"
              role="group"
              aria-label="确认清除全部阅读记录"
            >
              <p>确定清除所有剧情的阅读记录？此操作无法撤销。</p>
              <button
                onClick={() =>
                  void perform(async () => {
                    await clearHistory();
                    setConfirm(false);
                  }, '全部阅读记录已清除。')
                }
              >
                确认清除全部
              </button>
              <button onClick={() => setConfirm(false)}>取消</button>
            </div>
          )}
          <h3>最近阅读</h3>
          {!recent.length && <p className="muted">还没有阅读记录。</p>}
          {recent.map((record) => {
            const story = stories.find((item) => item.id === record.storyId);
            const chapter = story?.chapters.find(
              (item) => item.id === record.chapterId,
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
