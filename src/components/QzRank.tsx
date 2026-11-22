import { useRef, useState } from "react";

interface Item {
  id: string;
  label: string;
}

interface Props {
  items: Item[];
  value: string[] | undefined;
  onChange: (order: string[]) => void;
  label: string;
}

const PLACES = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Reorderable list. Dragging a row (pointer events, so touch works) moves it to
 * the highlighted slot on release; the arrow buttons are the keyboard / small
 * screen route to the same order.
 */
export default function QzRank({ items, value, onChange, label }: Props) {
  const list = useRef<HTMLUListElement>(null);
  const dragStart = useRef({ y: 0, index: 0 });
  const [drag, setDrag] = useState<{
    index: number;
    target: number;
    offset: number;
  } | null>(null);

  const order = value ?? items.map((item) => item.id);
  const answered = value !== undefined;
  const byId = new Map(items.map((item) => [item.id, item]));

  const rowStep = () => {
    const row = list.current?.querySelector("li");
    if (!row) return 72;
    const style = getComputedStyle(list.current!);
    return row.getBoundingClientRect().height + (parseFloat(style.rowGap) || 0);
  };

  const move = (from: number, to: number) => {
    const target = clamp(to, 0, order.length - 1);
    if (target === from) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };

  const endDrag = () => {
    if (!drag) return;
    move(drag.index, drag.target);
    setDrag(null);
  };

  return (
    <div className="rounded-[var(--r-card)] border border-line bg-surface p-4 sm:p-5">
      <ul ref={list} className="grid gap-2" role="list">
        {order.map((itemId, index) => {
          const item = byId.get(itemId);
          if (!item) return null;
          const isDragging = drag?.index === index;
          const isTarget = drag !== null && drag.target === index && drag.index !== index;
          return (
            <li
              key={item.id}
              className={`relative flex items-center gap-3 rounded-[var(--r-control)] border px-3 py-2.5 transition-[border-color,background-color,box-shadow,opacity] duration-200 ${
                isDragging
                  ? "z-10 border-[var(--accent)] bg-surface shadow-[0_14px_28px_-14px_rgb(0_0_0/0.5)]"
                  : isTarget
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : answered
                      ? "border-line bg-surface-2"
                      : "border-line bg-surface-2"
              }`}
              style={
                isDragging
                  ? { transform: `translateY(${drag.offset}px)` }
                  : undefined
              }
            >
              <span
                aria-hidden="true"
                className={`label grid size-8 shrink-0 place-items-center rounded-full tabular-nums ${
                  index === 0 && answered
                    ? "bg-[var(--accent)] text-[var(--on-accent)]"
                    : "bg-surface text-[var(--ink-muted)]"
                }`}
              >
                {PLACES[index] ?? index + 1}
              </span>

              <span className="min-w-0 flex-1 text-[14px] leading-snug text-[var(--ink-strong)] sm:text-[15px]">
                {item.label}
              </span>

              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  aria-label={`Move ${item.label} up`}
                  className="grid size-8 place-items-center rounded-full border border-line text-[var(--ink-soft)] transition-colors hover:border-ink/35 hover:text-ink disabled:opacity-25"
                >
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 19V5M6 11l6-6 6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === order.length - 1}
                  aria-label={`Move ${item.label} down`}
                  className="grid size-8 place-items-center rounded-full border border-line text-[var(--ink-soft)] transition-colors hover:border-ink/35 hover:text-ink disabled:opacity-25"
                >
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 5v14M6 13l6 6 6-6" />
                  </svg>
                </button>

                <button
                  type="button"
                  aria-label={`Drag ${item.label} to reorder`}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    dragStart.current = { y: event.clientY, index };
                    setDrag({ index, target: index, offset: 0 });
                  }}
                  onPointerMove={(event) => {
                    if (!drag) return;
                    const offset = event.clientY - dragStart.current.y;
                    const target = clamp(
                      dragStart.current.index + Math.round(offset / rowStep()),
                      0,
                      order.length - 1,
                    );
                    setDrag({ index: drag.index, target, offset });
                  }}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                    event.preventDefault();
                    move(index, index + (event.key === "ArrowDown" ? 1 : -1));
                  }}
                  className="grid size-8 cursor-grab touch-none place-items-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-surface hover:text-ink active:cursor-grabbing"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
                    <circle cx="9" cy="6" r="1.4" />
                    <circle cx="15" cy="6" r="1.4" />
                    <circle cx="9" cy="12" r="1.4" />
                    <circle cx="15" cy="12" r="1.4" />
                    <circle cx="9" cy="18" r="1.4" />
                    <circle cx="15" cy="18" r="1.4" />
                  </svg>
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="label mt-3 flex flex-wrap items-center justify-between gap-2 text-[var(--ink-muted)]">
        <span>{answered ? "Locked in. Change it if you like." : "Drag a row, or use the arrows"}</span>
        <span aria-hidden="true">1st counts most · 4th counts none</span>
      </p>
      <span className="sr-only" aria-live="polite">
        {label}: {order.map((id) => byId.get(id)?.label).join(", ")}
      </span>
    </div>
  );
}
