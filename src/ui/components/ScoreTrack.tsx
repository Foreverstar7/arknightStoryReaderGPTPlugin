import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Story } from '../../shared/contracts.js';
import type { ScoreMovement, ScoreNode } from '../../shared/score.js';

/** Mouse dragging augments native scrolling. Touch remains native so vertical
 * reading and horizontal browsing don't compete with a synthetic gesture. */
export function ScoreTrack({
  movement,
  stories,
  movements,
  register,
  renderStory,
  jump,
}: {
  movement: ScoreMovement;
  stories: Story[];
  movements: ScoreMovement[];
  register: (element: HTMLDivElement | null) => void;
  renderStory: (story: Story) => ReactNode;
  jump: (node: Extract<ScoreNode, { kind: 'junction' }>) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    x: number;
    left: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [axis, setAxis] = useState(0);
  const [overflow, setOverflow] = useState(false);
  function sync() {
    const element = track.current;
    if (!element) return;
    const max = element.scrollWidth - element.clientWidth;
    setAxis(max > 0 ? (element.scrollLeft / max) * 100 : 0);
    setOverflow(max > 1);
  }
  useLayoutEffect(() => {
    const element = track.current;
    if (!element) return;
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    sync();
    return () => observer.disconnect();
  }, [movement.nodes]);
  return (
    <>
      <div
        className="score-track"
        ref={(element) => {
          track.current = element;
          register(element);
        }}
        tabIndex={0}
        role="region"
        aria-label={`${movement.title}剧情轴`}
        onScroll={sync}
        onPointerDown={(event) => {
          if (
            event.pointerType !== 'mouse' ||
            event.button !== 0 ||
            matchMedia('(max-width: 600px)').matches
          )
            return;
          suppressClick.current = false;
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            left: event.currentTarget.scrollLeft,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.id !== event.pointerId) return;
          if (!current.moved && Math.abs(event.clientX - current.x) > 6) {
            current.moved = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          if (current.moved) {
            event.preventDefault();
            event.currentTarget.scrollLeft =
              current.left + current.x - event.clientX;
            suppressClick.current = true;
          }
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
          suppressClick.current = false;
        }}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
          }
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            event.currentTarget.scrollLeft +=
              event.key === 'ArrowRight' ? 280 : -280;
          }
        }}
      >
        <div className="score-axis">
          {movement.nodes.map((node, index) => {
            if (node.kind === 'story') {
              const story = stories.find((item) => item.id === node.storyId);
              return story ? (
                <div
                  className={`score-story score-story-${movement.nodes.slice(0, index).filter((item) => item.kind === 'story').length % 2}`}
                  key={story.id}
                >
                  {renderStory(story)}
                </div>
              ) : null;
            }
            const target = stories.find(
              (item) => item.id === node.targetStoryId,
            );
            const targetMovement = movements.find(
              (item) => item.id === node.targetMovementId,
            );
            return target && targetMovement ? (
              <div className="score-junction" key={node.key}>
                <button
                  data-junction={node.key}
                  onClick={() => jump(node)}
                  aria-label={`跳转到${targetMovement.title}：${target.title}`}
                >
                  <small>{targetMovement.title}</small>
                  <span>
                    {target.title}
                    <span aria-hidden="true">
                      {node.direction === 'incoming' ? ' ↙' : ' ↗'}
                    </span>
                  </span>
                </button>
              </div>
            ) : null;
          })}
        </div>
      </div>
      <label className="score-seek">
        浏览线
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={axis}
          disabled={!overflow}
          aria-label={`${movement.title}浏览线`}
          onChange={(event) => {
            const element = track.current;
            if (element)
              element.scrollLeft =
                (Number(event.target.value) / 100) *
                (element.scrollWidth - element.clientWidth);
          }}
        />
      </label>
    </>
  );
}
