import { useEffect, useRef, useState } from 'react';
import {
  imageInputSchema,
  imageResultSchema,
  type ImageInput,
  type ReaderImage,
} from '../../shared/contracts.js';
import type { ReaderTransport } from '../transport.js';

/** Observe the real scrolling container; do not fetch from a hidden card/chapter. */
export function useVisible<T extends HTMLElement>(
  enabled = true,
  margin = '0px',
) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node || seen) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      {
        root: node.closest('.reader-scroll, .timeline-scroll, .library-scroll'),
        rootMargin: margin,
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, margin, seen]);
  return { ref, seen };
}

export function ImageLayers({
  image,
  label,
  cover = false,
  onError,
}: {
  image: ReaderImage;
  label: string;
  cover?: boolean;
  onError?: () => void;
}) {
  return (
    <svg
      className="source-image"
      viewBox={`0 0 ${image.width} ${image.height}`}
      preserveAspectRatio={cover ? 'xMidYMid slice' : 'xMidYMid meet'}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {image.layers.map((layer, index) => (
        <image
          key={index}
          href={layer.dataUrl}
          x={layer.x}
          y={layer.y}
          width={layer.width}
          height={layer.height}
          onError={onError}
        />
      ))}
    </svg>
  );
}

export function SourceImage({
  input,
  transport,
  label,
  cover = false,
  retryable = true,
}: {
  input: ImageInput;
  transport: ReaderTransport;
  label: string;
  cover?: boolean;
  retryable?: boolean;
}) {
  const [image, setImage] = useState<ReaderImage | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  // The semantic key avoids re-fetching when the parent re-renders during scroll saves.
  const key = JSON.stringify(input);
  useEffect(() => {
    let active = true;
    setError('');
    setImage(null);
    async function read() {
      try {
        const args: unknown = JSON.parse(key);
        const result = imageResultSchema.parse(
          await transport.call('reader_image', { ...imageInput(args) }),
        );
        if (active) setImage(result);
      } catch (error) {
        if (active)
          setError(
            error instanceof Error ? error.message : '图片读取失败，请重试。',
          );
      }
    }
    void read();
    return () => {
      active = false;
    };
  }, [transport, key, attempt]);
  if (error)
    return (
      <span
        className="image-error"
        role={cover ? undefined : 'status'}
        title={error}
      >
        {cover ? '暂无封面' : error}
        {retryable && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              setAttempt(attempt + 1);
            }}
          >
            重试图片
          </button>
        )}
      </span>
    );
  if (!image)
    return (
      <span className="image-loading" role={cover ? undefined : 'status'}>
        {cover ? '加载中…' : '正在读取图片…'}
      </span>
    );
  return (
    <>
      <ImageLayers
        image={image}
        label={label}
        cover={cover}
        onError={() => setError('图片解码失败，请清理图片缓存后重试。')}
      />
      {!cover && (
        <a
          className="image-source muted"
          href={image.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          PRTS 资源来源
        </a>
      )}
    </>
  );
}

function imageInput(value: unknown): ImageInput {
  return imageInputSchema.parse(value);
}
