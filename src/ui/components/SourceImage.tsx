import { useContext, useEffect, useRef, useState } from 'react';
import {
  imageInputSchema,
  type ImageInput,
  type ReaderImage,
} from '../../shared/contracts.js';
import type { ReaderTransport } from '../transport.js';
import { ReaderError, type ReaderFailure } from '../../shared/errors.js';
import { coverPresentation } from '../../shared/cover-policy.js';
import { CoverImagesContext } from '../cover-images.js';

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
  onError,
  cover = false,
}: {
  image: ReaderImage;
  label: string;
  onError?: () => void;
  cover?: boolean;
}) {
  return (
    <svg
      className="source-image"
      viewBox={`0 0 ${image.width} ${image.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
      data-image-state="ready"
      data-portrait-state={image.portrait?.status}
      data-source-url={image.attribution?.sourceUrl ?? image.sourceUrl}
      data-cover-presentation={cover ? coverPresentation(image) : undefined}
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
          preserveAspectRatio="none"
          opacity={layer.opacity}
          transform={
            layer.rotation
              ? `rotate(${layer.rotation} ${layer.x + layer.width / 2} ${layer.y + layer.height / 2})`
              : undefined
          }
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
  // The semantic key avoids re-fetching when the parent re-renders during scroll saves.
  const key = JSON.stringify(input);
  const covers = useContext(CoverImagesContext);
  const initialImage = cover ? covers?.get(key) : undefined;
  const [state, setState] = useState<ImageState>(() =>
    initialImage
      ? { status: 'ready', image: initialImage }
      : { status: 'idle' },
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const generation = covers?.generation;
    const loaded = cover && attempt === 0 ? covers?.get(key) : undefined;
    if (loaded) {
      setState({ status: 'ready', image: loaded });
      return;
    }
    if (!enabled) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    async function read() {
      try {
        const args: unknown = JSON.parse(key);
        const image = await transport.call('reader_image', {
          ...imageInput(args),
          ...(attempt > 0 ? { refresh: true } : {}),
        });
        if (active) {
          // A request begun before cache clearing may still finish visibly, but
          // must not repopulate reuse for future mounts after that clear.
          if (cover && covers?.generation === generation)
            covers?.set(key, image);
          setState({ status: 'ready', image });
        }
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
  }, [transport, key, attempt, enabled, cover, covers]);
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
  if (cover && coverPresentation(state.image) === 'deferred')
    return (
      <span
        className="image-deferred"
        data-image-state="deferred"
        data-source-url={
          state.image.attribution?.sourceUrl ?? state.image.sourceUrl
        }
        title={`原图 ${state.image.width} × ${state.image.height}；此来源尺寸尚未适配。`}
      >
        封面尺寸待适配
      </span>
    );
  if (state.image.portrait?.status === 'placeholder')
    return (
      <div
        className="portrait-placeholder"
        data-image-state="placeholder"
        data-portrait-state="placeholder"
        role="status"
      >
        <svg viewBox="0 0 160 180" role="img" aria-label="中性人物占位图">
          <circle cx="80" cy="55" r="27" fill="currentColor" />
          <path d="M28 155v-20a52 52 0 0 1 104 0v20z" fill="currentColor" />
        </svg>
        <p>暂无可确认的立绘</p>
        <p className="muted">{state.image.portrait.message}</p>
        {retryable && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setAttempt((value) => value + 1);
            }}
          >
            重新核验立绘
          </button>
        )}
      </div>
    );
  return (
    <>
      <ImageLayers
        image={state.image}
        label={label}
        cover={cover}
        onError={() => {
          if (cover) covers?.delete(key);
          setState({
            status: 'error',
            failure: {
              code: 'parse',
              message: '图片解码失败，重试会重新获取此图片，不清除阅读记录。',
              sourceUrl: state.image.sourceUrl,
            },
          });
        }}
      />
      {state.image.portrait?.status === 'default' && (
        <p
          className="portrait-resolution"
          role="status"
          data-portrait-state="default"
        >
          {state.image.portrait.message}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setAttempt((value) => value + 1);
            }}
          >
            重试原立绘
          </button>
        </p>
      )}
      {state.image.description && (
        <p className="muted image-description">{state.image.description}</p>
      )}
      {!cover && (
        <a
          className="image-source muted"
          href={state.image.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {state.image.sourceLabel ??
            (input.kind === 'portrait' ? 'PRTS' : 'PRTS 资源来源')}
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
