import { useEffect, useRef, useState } from 'react';
import {
  imageInputSchema,
  imageResultSchema,
  type ImageInput,
  type ReaderImage,
} from '../../shared/contracts.js';
import type { ReaderTransport } from '../transport.js';
import { ReaderError, type ReaderFailure } from '../../shared/errors.js';

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
      data-image-state="ready"
      data-source-url={image.attribution?.sourceUrl ?? image.sourceUrl}
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
  enabled = true,
}: {
  input: ImageInput;
  transport: ReaderTransport;
  label: string;
  cover?: boolean;
  retryable?: boolean;
  enabled?: boolean;
}) {
  const [state, setState] = useState<ImageState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  // The semantic key avoids re-fetching when the parent re-renders during scroll saves.
  const key = JSON.stringify(input);
  useEffect(() => {
    let active = true;
    if (!enabled) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    async function read() {
      try {
        const args: unknown = JSON.parse(key);
        const result = imageResultSchema.safeParse(
          await transport.call('reader_image', {
            ...imageInput(args),
            ...(attempt > 0 ? { refresh: true } : {}),
          }),
        );
        if (!result.success)
          throw new ReaderError('parse', '图片结果格式不兼容，请重试。');
        if (active) setState({ status: 'ready', image: result.data });
      } catch (error) {
        if (active)
          setState({
            status: 'error',
            failure:
              error instanceof ReaderError
                ? error.toFailure()
                : {
                    code: 'unknown',
                    message:
                      error instanceof Error
                        ? error.message
                        : '图片读取失败，请重试。',
                  },
          });
      }
    }
    void read();
    return () => {
      active = false;
    };
  }, [transport, key, attempt, enabled]);
  if (state.status === 'error')
    return (
      <span
        className="image-error"
        role={cover ? undefined : 'status'}
        title={state.failure.message}
        data-image-state="error"
        data-error-code={state.failure.code}
        data-source-url={state.failure.sourceUrl}
      >
        {cover ? coverFailureLabel(state.failure.code) : state.failure.message}
        {retryable && (
          <button
            type="button"
            aria-label={cover ? `重试${label}` : '重试图片'}
            aria-description={`${state.failure.message}${state.failure.sourceUrl ? ` 来源：${state.failure.sourceUrl}` : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              setAttempt((value) => value + 1);
            }}
          >
            {cover ? '重试封面' : '重试图片'}
          </button>
        )}
      </span>
    );
  if (state.status !== 'ready')
    return (
      <span
        className={state.status === 'idle' ? 'image-idle' : 'image-loading'}
        data-image-state={state.status}
        role={cover ? undefined : 'status'}
      >
        {state.status === 'idle'
          ? '封面待加载'
          : cover
            ? '加载中…'
            : '正在读取图片…'}
      </span>
    );
  return (
    <>
      <ImageLayers
        image={state.image}
        label={label}
        cover={cover}
        onError={() =>
          setState({
            status: 'error',
            failure: {
              code: 'parse',
              message: '图片解码失败，重试会重新获取此图片，不清除阅读记录。',
              sourceUrl: state.image.sourceUrl,
            },
          })
        }
      />
      {!cover && (
        <a
          className="image-source muted"
          href={state.image.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          PRTS 资源来源
        </a>
      )}
    </>
  );
}

type ImageState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; image: ReaderImage }
  | { status: 'error'; failure: ReaderFailure };

function coverFailureLabel(code: ReaderFailure['code']) {
  switch (code) {
    case 'resource_missing':
      return '封面资源缺失';
    case 'not_found':
      return '封面资料页缺失';
    case 'network':
      return '封面请求失败';
    case 'parse':
      return '封面解析不兼容';
    case 'unsupported':
      return '封面来源待适配';
    case 'storage':
      return '封面缓存读取失败';
    default:
      return '封面读取失败';
  }
}

function imageInput(value: unknown): ImageInput {
  return imageInputSchema.parse(value);
}
