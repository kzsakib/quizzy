import { useRef, useState } from "react";
import type { PointAnswer } from "../lib/scoring";

interface Axis {
  label: string;
  trait: string;
}

interface Props {
  value: PointAnswer | undefined;
  onChange: (value: PointAnswer) => void;
  x: { low: Axis; high: Axis };
  y: { low: Axis; high: Axis };
  quadrants: {
    lowLow: string;
    lowHigh: string;
    highLow: string;
    highHigh: string;
  };
  label: string;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * A dot dragged inside a square. `x` runs left→right, `y` bottom→top, both
 * 0–100. Keyboard: arrow keys nudge by 5, shift+arrow by 20.
 */
export default function QzMap({
  value,
  onChange,
  x,
  y,
  quadrants,
  label,
}: Props) {
  const area = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const point = value ?? { x: 50, y: 50 };
  const answered = value !== undefined;

  const quadrant = `${point.y >= 50 ? "high" : "low"}${
    point.x >= 50 ? "High" : "Low"
  }` as "lowLow" | "lowHigh" | "highLow" | "highHigh";

  const update = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = area.current?.getBoundingClientRect();
    if (!rect) return;
    onChange({
      x: Math.round(clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100)),
      y: Math.round(
        clamp(100 - ((event.clientY - rect.top) / rect.height) * 100, 0, 100),
      ),
    });
  };

  const nudge = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 20 : 5;
    const moves: Record<string, PointAnswer> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: step },
      ArrowDown: { x: 0, y: -step },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onChange({
      x: clamp(point.x + move.x, 0, 100),
      y: clamp(point.y + move.y, 0, 100),
    });
  };

  // Keys read y-then-x: lowHigh is bottom-right (low y, high x), highLow is
  // top-left (high y, low x).
  const corners: Array<{
    key: "lowHigh" | "highHigh" | "lowLow" | "highLow";
    className: string;
  }> = [
    { key: "highLow", className: "left-2 top-2 text-left" },
    { key: "highHigh", className: "right-2 top-2 text-right" },
    { key: "lowLow", className: "bottom-2 left-2 text-left" },
    { key: "lowHigh", className: "bottom-2 right-2 text-right" },
  ];

  return (
    <div className="rounded-[var(--r-card)] border border-line bg-surface p-4 sm:p-6">
      <div className="mx-auto flex max-w-[540px] items-stretch gap-2 sm:gap-3">
        <div className="flex w-5 shrink-0 flex-col justify-between pb-10 pt-1">
          <span className="label whitespace-nowrap leading-none text-[var(--ink-muted)] [writing-mode:vertical-rl]">
            {y.high.label}
          </span>
          <span className="label whitespace-nowrap leading-none text-[var(--ink-muted)] [writing-mode:vertical-rl]">
            {y.low.label}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div
            ref={area}
            role="slider"
            tabIndex={0}
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={point.x}
            aria-valuetext={
              answered
                ? `${Math.round(point.x)}% towards ${x.high.label}, ${Math.round(point.y)}% towards ${y.high.label}. ${quadrants[quadrant]}.`
                : "Not answered. Drag the dot or use the arrow keys."
            }
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(true);
              update(event);
            }}
            onPointerMove={(event) => {
              if (dragging) update(event);
            }}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            onKeyDown={nudge}
            className={`relative aspect-square w-full cursor-crosshair touch-none select-none overflow-hidden rounded-[var(--r-control)] border bg-surface-2 transition-colors duration-200 ${
              answered ? "border-line" : "border-dashed border-ink/25"
            } ${dragging ? "border-[var(--accent)]" : ""}`}
          >
            {/* centre lines */}
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink/12"
            />
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink/12"
            />

            {corners.map((corner) => {
              const active = quadrant === corner.key;
              return (
                <span
                  key={corner.key}
                  aria-hidden="true"
                  className={`absolute z-10 max-w-[46%] rounded-full px-1.5 py-1 text-[9px] font-semibold uppercase leading-[1.1] tracking-[0.03em] transition-colors duration-200 sm:px-2 sm:text-[10px] ${corner.className} ${
                    active
                      ? "bg-[var(--accent)] text-[var(--on-accent)]"
                      : "bg-surface/70 text-[var(--ink-muted)]"
                  }`}
                >
                  {quadrants[corner.key]}
                </span>
              );
            })}

            {/* crosshair through the dot */}
            <span
              aria-hidden="true"
              className="absolute inset-y-0 z-10 w-px -translate-x-1/2 bg-[var(--accent)]/35"
              style={{ left: `${point.x}%` }}
            />
            <span
              aria-hidden="true"
              className="absolute inset-x-0 z-10 h-px -translate-y-1/2 bg-[var(--accent)]/35"
              style={{ top: `${100 - point.y}%` }}
            />

            <span
              aria-hidden="true"
              className={`absolute z-20 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[5px] border-[var(--surface)] shadow-[0_6px_18px_-6px_rgb(0_0_0/0.6)] transition-[background-color,transform] duration-200 ${
                answered
                  ? "bg-[var(--accent)]"
                  : "bg-[var(--ink)]/45"
              } ${dragging ? "scale-110" : ""}`}
              style={{ left: `${point.x}%`, top: `${100 - point.y}%` }}
            />

            {!answered ? (
              <span className="absolute inset-x-0 bottom-[38%] z-10 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                Drag the dot
              </span>
            ) : null}
          </div>

          <div className="mt-2.5 flex items-baseline justify-between gap-3">
            <span className="label leading-[1.15] text-[var(--ink-muted)]">
              {x.low.label}
            </span>
            <span className="label text-right leading-[1.15] text-[var(--ink-muted)]">
              {x.high.label}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-4 flex max-w-[540px] flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t border-line/70 pt-3">
        <p className="label text-[var(--accent-text)]">
          {answered ? quadrants[quadrant] : "Not on the map yet"}
        </p>
        <p className="label tabular-nums text-[var(--ink-muted)]">
          {answered
            ? `${x.low.label} ${100 - Math.round(point.x)} · ${y.low.label} ${100 - Math.round(point.y)}`
            : "Tap anywhere in the square"}
        </p>
      </div>
    </div>
  );
}
