/** A white disc with a clockwise arc; unknown progress is never presented as a percentage. */
export function ProgressRing({
  value,
  title,
}: {
  value: number | null;
  title: string;
}) {
  return (
    <span
      className="progress-ring"
      role="progressbar"
      aria-label={`${title}阅读进度`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      aria-valuetext={
        value === null ? '进度待统计，打开剧情后自动加载正文' : `${value}%`
      }
      title={
        value === null ? '打开剧情后自动加载正文并统计进度' : `已读 ${value}%`
      }
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle className="progress-ring-base" cx="24" cy="24" r="23" />
        <circle
          className="progress-ring-arc"
          cx="24"
          cy="24"
          r="20"
          pathLength="100"
          strokeDasharray={`${value ?? 0} 100`}
          transform="rotate(-90 24 24)"
        />
      </svg>
      <span>{value === null ? '—' : `${value}%`}</span>
    </span>
  );
}
