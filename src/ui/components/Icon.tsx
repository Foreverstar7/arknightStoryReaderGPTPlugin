export function Icon({
  name,
}: {
  name: 'previous' | 'next' | 'collapse' | 'expand';
}) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d={
          name === 'previous'
            ? 'm14 5-7 7 7 7'
            : name === 'next'
              ? 'm10 5 7 7-7 7'
              : name === 'collapse'
                ? 'm6 14 6-6 6 6M5 4h14'
                : 'm6 10 6 6 6-6M5 20h14'
        }
      />
    </svg>
  );
}
