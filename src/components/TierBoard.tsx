import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { onAccentInk } from "../lib/accents";
import type { TierList } from "../lib/tierlists-types";
import { siteHref } from "../lib/url";

type Placements = Record<string, string>;

const POOL = "pool";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const boxOf = (el: Element | null): Box | null => {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
};

interface Props {
  list: TierList;
}

/**
 * Drag-and-drop tier board.
 *
 * Pointer events drive the drag (mouse, pen and touch all work), with a
 * fixed-position ghost that is moved by writing to its style node directly so
 * nothing re-renders per frame. A plain tap selects an item, then a tier
 * places it — that is also the whole keyboard path, so the board never depends
 * on dragging. Everything is saved to localStorage.
 */
export default function TierBoard({ list }: Props) {
  const total = list.items.length;
  const storageKey = `qz:tier:${list.slug}`;

  const [placements, setPlacements] = useState<Placements>({});
  const [poolOrder, setPoolOrder] = useState<string[]>(() =>
    list.items.map((item) => item.id),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  /* The chip that is currently flying into its new home. It is rendered as a
     fixed overlay so the tier's `overflow-hidden` cannot clip the journey. */
  const [flyer, setFlyer] = useState<{ id: string; from: Box } | null>(null);
  const [landed, setLanded] = useState<string | null>(null);

  const ghostRef = useRef<HTMLDivElement>(null);
  const flyerRef = useRef<HTMLDivElement>(null);
  const flightRef = useRef<Animation | null>(null);
  const landedTimer = useRef<number | undefined>(undefined);
  const justDragged = useRef(false);

  /* FLIP: remember where every chip sat before a placement, then slide each
     one from its old box to its new box once React has re-rendered. The chip
     that was placed is skipped — it travels as the flying overlay instead. */
  const flipFrom = useRef<Map<string, Box> | null>(null);

  const captureChips = useCallback((skip?: string) => {
    const boxes = new Map<string, Box>();
    document.querySelectorAll<HTMLElement>("[data-item-id]").forEach((el) => {
      const id = el.dataset.itemId;
      if (!id || id === skip) return;
      const box = boxOf(el);
      if (box) boxes.set(id, box);
    });
    flipFrom.current = boxes;
  }, []);

  useLayoutEffect(() => {
    const before = flipFrom.current;
    flipFrom.current = null;
    if (!before) return;

    document.querySelectorAll<HTMLElement>("[data-item-id]").forEach((el) => {
      const id = el.dataset.itemId;
      const previous = id ? before.get(id) : undefined;
      if (!previous) return;
      const now = el.getBoundingClientRect();
      const dx = previous.left - now.left;
      const dy = previous.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: "translate(0px, 0px)" },
        ],
        { duration: 460, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    });
  }, [placements, poolOrder]);

  /* Fly the placed chip from where it was to where it now lives. Runs after
     the board has re-rendered, so the destination box is measurable. */
  useLayoutEffect(() => {
    if (!flyer) return;
    const node = flyerRef.current;
    const target = document.querySelector<HTMLElement>(
      `[data-item-id="${flyer.id}"]`,
    );
    if (!node || !target) {
      setFlyer(null);
      return;
    }

    const flight = boxOf(target);
    if (!flight) {
      setFlyer(null);
      return;
    }

    const dx = flight.left - flyer.from.left;
    const dy = flight.top - flyer.from.top;
    const grow = flyer.from.width
      ? Math.max(0.9, Math.min(1.15, flight.width / flyer.from.width))
      : 1;

    flightRef.current?.cancel();
    const animation = node.animate(
      [
        { transform: "translate(0px, 0px) scale(1.08)", opacity: 0.92 },
        {
          transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) scale(${1.04 * grow})`,
          opacity: 1,
          offset: 0.6,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 1 },
      ],
      {
        duration: 520,
        easing: "cubic-bezier(0.32, 0.72, 0.24, 1)",
        fill: "forwards",
      },
    );
    flightRef.current = animation;

    const finish = () => {
      setFlyer(null);
      setLanded(flyer.id);
      window.clearTimeout(landedTimer.current);
      landedTimer.current = window.setTimeout(() => setLanded(null), 380);
    };
    animation.onfinish = finish;
    const safety = window.setTimeout(finish, 1400);

    return () => {
      window.clearTimeout(safety);
      animation.onfinish = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyer]);

  useEffect(() => () => window.clearTimeout(landedTimer.current), []);

  const labels = useMemo(
    () => Object.fromEntries(list.items.map((item) => [item.id, item.label])),
    [list.items],
  );
  const images = useMemo(
    () =>
      Object.fromEntries(
        list.items
          .filter((item) => item.image)
          .map((item) => [item.id, item.image as string]),
      ),
    [list.items],
  );
  const tierNames = useMemo(
    () => Object.fromEntries(list.tiers.map((tier) => [tier.id, tier.name])),
    [list.tiers],
  );

  /* Restore a half-finished sort. Anything that no longer matches the data
     file (renamed item, removed tier) is quietly dropped. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          placements?: Placements;
          poolOrder?: string[];
        };
        const validTier = new Set(list.tiers.map((tier) => tier.id));
        const validItem = new Set(list.items.map((item) => item.id));
        const restored: Placements = {};
        for (const [id, tier] of Object.entries(parsed.placements ?? {})) {
          if (validItem.has(id) && validTier.has(tier)) restored[id] = tier;
        }
        setPlacements(restored);
        const order = (parsed.poolOrder ?? []).filter((id) => validItem.has(id));
        const missing = list.items
          .map((item) => item.id)
          .filter((id) => !order.includes(id) && !restored[id]);
        setPoolOrder([...order, ...missing]);
      }
    } catch {
      /* storage blocked: start from a clean board */
    }
    setHydrated(true);
  }, [list, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ placements, poolOrder }),
      );
    } catch {
      /* private mode: the sort simply will not survive a refresh */
    }
  }, [placements, poolOrder, storageKey, hydrated]);

  const placedCount = Object.keys(placements).length;
  const progress = Math.round((placedCount / total) * 100);
  const complete = placedCount === total;

  const poolItems = poolOrder
    .filter((id) => !placements[id])
    .map((id) => ({ id, label: labels[id] }));

  const place = useCallback(
    (id: string, tierId: string, from?: Box) => {
      const origin =
        from ??
        boxOf(document.querySelector(`[data-item-id="${id}"]`)) ??
        null;
      captureChips(id);
      if (origin) setFlyer({ id, from: origin });
      setPlacements((previous) => {
        const next = { ...previous };
        if (tierId === POOL) delete next[id];
        else next[id] = tierId;
        return next;
      });
      setPoolOrder((previous) => {
        const without = previous.filter((entry) => entry !== id);
        return tierId === POOL ? [...without, id] : without;
      });
      setSelected(null);
      setAnnouncement(
        tierId === POOL
          ? `${labels[id]} sent back to the pile.`
          : `${labels[id]} placed in ${tierNames[tierId]}.`,
      );
    },
    [captureChips, labels, tierNames],
  );

  const beginDrag = (id: string, event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const startX = event.clientX;
    const startY = event.clientY;
    let active = false;

    const hover = (x: number, y: number) => {
      const under = document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>("[data-drop-tier]");
      const tierId = under?.dataset.dropTier ?? null;
      setOver((current) => (current === tierId ? current : tierId));
    };

    const move = (dragEvent: PointerEvent) => {
      if (!active) {
        if (Math.hypot(dragEvent.clientX - startX, dragEvent.clientY - startY) < 7)
          return;
        active = true;
        setDragging(id);
        setSelected(null);
        const ghost = ghostRef.current;
        if (ghost) ghost.style.width = `${rect.width}px`;
      }
      const ghost = ghostRef.current;
      if (ghost) {
        ghost.style.transform = `translate3d(${dragEvent.clientX - offsetX}px, ${
          dragEvent.clientY - offsetY
        }px, 0)`;
      }
      hover(dragEvent.clientX, dragEvent.clientY);
    };

    const finish = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      setDragging(null);
      setOver(null);

      if (!active) return;

      const under = document
        .elementFromPoint(upEvent.clientX, upEvent.clientY)
        ?.closest<HTMLElement>("[data-drop-tier]");
      const tierId = under?.dataset.dropTier;
      if (tierId)
        place(id, tierId, {
          left: upEvent.clientX - offsetX,
          top: upEvent.clientY - offsetY,
          width: rect.width,
          height: rect.height,
        });

      justDragged.current = true;
      window.setTimeout(() => {
        justDragged.current = false;
      }, 90);
    };

    const cancel = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      setDragging(null);
      setOver(null);
    };

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
  };

  const pick = (id: string) => {
    if (justDragged.current) return;
    setSelected((current) => (current === id ? null : id));
  };

  const placeSelected = (tierId: string) => {
    if (!selected) return;
    place(selected, tierId);
  };

  const reset = () => {
    captureChips();
    setPlacements({});
    setPoolOrder(list.items.map((item) => item.id));
    setSelected(null);
    setAnnouncement("Board cleared. Every item is back in the pile.");
  };

  const shuffle = () => {
    captureChips();
    const shuffled = [...poolItems.map((item) => item.id)];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const rest = poolOrder.filter((id) => placements[id]);
    setPoolOrder([...shuffled, ...rest]);
    setAnnouncement("The pile has been shuffled.");
  };

  const copy = async () => {
    const lines = [
      `${list.title} — my tier list`,
      "",
      ...list.tiers.map(
        (tier) =>
          `${tier.name.toUpperCase()}: ${
            list.items
              .filter((item) => placements[item.id] === tier.id)
              .map((item) => item.label)
              .join(", ") || "—"
          }`,
      ),
      "",
      `Unplaced: ${poolItems.map((item) => item.label).join(", ") || "—"}`,
    ];
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1900);
    } catch {
      /* clipboard blocked; the summary is still on screen below */
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1040px]">
      {/* Toolbar ---------------------------------------------------- */}
      <div className="sticky top-[80px] z-30 flex flex-wrap items-center gap-2 rounded-[var(--r-card)] border border-line bg-surface/85 px-3 py-2.5 backdrop-blur-md sm:top-[92px] sm:flex-nowrap sm:gap-3 sm:rounded-[var(--r-pill)] sm:px-4">
        <div
          className="flex h-1.5 w-full items-center overflow-hidden rounded-full bg-surface-2 sm:w-auto sm:flex-1"
          role="progressbar"
          aria-label="Items sorted"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={placedCount}
        >
          <span
            className="block h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(progress, 2)}%` }}
          />
        </div>
        <p className="label shrink-0 tabular-nums text-[var(--ink-muted)]">
          {placedCount}/{total}
        </p>
        <button
          type="button"
          onClick={shuffle}
          className="label rounded-[var(--r-pill)] border border-line px-3 py-2 text-[var(--ink-soft)] transition-colors hover:border-ink/35 hover:text-ink"
        >
          Shuffle
        </button>
        <button
          type="button"
          onClick={reset}
          className="label rounded-[var(--r-pill)] border border-line px-3 py-2 text-[var(--ink-soft)] transition-colors hover:border-ink/35 hover:text-ink"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={copy}
          className="label ml-auto rounded-[var(--r-pill)] bg-ink px-3.5 py-2 text-[var(--on-ink)] transition-transform duration-200 hover:-translate-y-0.5 sm:ml-0 sm:px-4"
        >
          {copied ? "Copied ✓" : "Copy mine"}
        </button>
      </div>

      {/* Selection hint --------------------------------------------- */}
      <div className="mt-3 min-h-[30px]">
        {selected ? (
          <p
            key={selected}
            className="qz-tier-hint label inline-flex items-center gap-2 rounded-[var(--r-pill)] bg-[var(--accent)] px-3.5 py-2 text-[var(--on-accent)]"
          >
            <span
              aria-hidden="true"
              className="inline-block size-1.5 rounded-full bg-current"
            />
            {labels[selected]} picked up — tap a tier
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="ml-1 rounded-full border border-current/40 px-2 py-0.5 text-[10px]"
            >
              Cancel
            </button>
          </p>
        ) : (
          <p className="label text-[var(--ink-muted)]">
            Drag a card into a tier · or tap it, then tap a tier · tap the pile
            to send it back
          </p>
        )}
      </div>

      {/* Pile ------------------------------------------------------- */}
      <section
        data-drop-tier={POOL}
        onClick={(event) => {
          if (!selected) return;
          if ((event.target as HTMLElement).closest("[data-item]")) return;
          placeSelected(POOL);
        }}
        aria-labelledby="pile-heading"
        className={[
          "mt-5 rounded-[var(--r-card)] border border-dashed p-4 transition-colors duration-200 sm:p-5",
          over === POOL
            ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]"
            : "border-line bg-surface/60",
        ].join(" ")}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="pile-heading" className="label text-[var(--ink-muted)]">
            The pile
          </h2>
          <p className="label tabular-nums text-[var(--ink-muted)]">
            {poolItems.length} left
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {poolItems.length === 0 ? (
            <p className="qz-tier-empty py-4 text-sm text-[var(--ink-muted)]">
              Everything is placed. Now defend it.
            </p>
          ) : (
            poolItems.map((item) => (
              <Chip
                key={item.id}
                itemId={item.id}
                label={item.label}
                image={images[item.id]}
                selected={selected === item.id}
                dragging={dragging === item.id}
                hidden={flyer?.id === item.id}
                landing={landed === item.id}
                onPointerDown={(event) => beginDrag(item.id, event)}
                onClick={() => pick(item.id)}
              />
            ))
          )}
        </div>
      </section>

      {/* Tiers ------------------------------------------------------ */}
      <div className="mt-8 space-y-3">
        {list.tiers.map((tier) => {
          const items = list.items.filter(
            (item) => placements[item.id] === tier.id,
          );
          const isOver = over === tier.id;
          return (
            <section
              key={tier.id}
              data-drop-tier={tier.id}
              aria-labelledby={`tier-${tier.id}`}
              onClick={(event) => {
                if (!selected) return;
                if ((event.target as HTMLElement).closest("[data-item]")) return;
                placeSelected(tier.id);
              }}
              style={
                {
                  "--tier-accent": `var(--accent-${tier.accent})`,
                  "--tier-ink": onAccentInk(tier.accent),
                } as React.CSSProperties
              }
              className={[
                "qz-tier group relative grid overflow-hidden rounded-[var(--r-card)] border bg-surface transition-[border-color,box-shadow,transform] duration-200 sm:grid-cols-[184px_1fr]",
                isOver
                  ? "border-[var(--tier-accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--tier-accent)_30%,transparent)] sm:scale-[1.006]"
                  : "border-line",
              ].join(" ")}
            >
              <div
                className="relative flex items-center justify-between gap-3 p-4 text-[var(--tier-ink)] sm:min-h-[112px] sm:flex-col sm:items-start sm:p-5"
                style={{ background: "var(--tier-accent)" }}
              >
                <h3
                  id={`tier-${tier.id}`}
                  className="display text-[clamp(20px,2.4vw,27px)] leading-[0.9]"
                >
                  {tier.name}
                </h3>

                <div className="flex shrink-0 items-center gap-2 sm:mt-auto">
                  {selected ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        placeSelected(tier.id);
                      }}
                      className="label rounded-[var(--r-pill)] bg-[var(--tier-ink)]/15 px-2.5 py-1.5 ring-1 ring-inset ring-[var(--tier-ink)]/25 transition-transform hover:scale-105"
                    >
                      Place here
                    </button>
                  ) : null}
                  <span
                    key={items.length}
                    className="qz-tier-count grid min-w-8 place-items-center rounded-full bg-[var(--tier-ink)]/15 px-2 py-1 text-[12px] font-bold tabular-nums"
                  >
                    {items.length}
                  </span>
                </div>
              </div>

              <div className="relative min-h-[112px] p-3 sm:p-4">
                <div className="flex flex-wrap gap-2">
                  {items.length === 0 ? (
                    <p
                      className={[
                        "qz-tier-drop grid min-h-[64px] w-full place-items-center rounded-[var(--r-control)] border border-dashed text-[13px] transition-colors",
                        isOver
                          ? "border-[var(--tier-accent)] text-[var(--ink-strong)]"
                          : "border-line/80 text-[var(--ink-muted)]",
                      ].join(" ")}
                    >
                      {isOver ? "Drop it here" : "Nothing yet"}
                    </p>
                  ) : (
                    items.map((item) => (
                      <Chip
                        key={item.id}
                        itemId={item.id}
                        label={item.label}
                        image={images[item.id]}
                        selected={selected === item.id}
                        dragging={dragging === item.id}
                        hidden={flyer?.id === item.id}
                        landing={landed === item.id}
                        onPointerDown={(event) => beginDrag(item.id, event)}
                        onClick={() => pick(item.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* Finished --------------------------------------------------- */}
      <div
        className={[
          "mt-8 overflow-hidden rounded-[var(--r-card)] border transition-all duration-500",
          complete
            ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))]"
            : "border-line bg-surface",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-end justify-between gap-5 p-5 sm:p-6">
          <div>
            <p className="label text-[var(--ink-muted)]">
              {complete ? "All sorted" : `${total - placedCount} still in the pile`}
            </p>
            <p className="display mt-2 max-w-[24ch] text-[clamp(24px,3.6vw,36px)] leading-[0.95]">
              {complete
                ? "That is a defensible opinion."
                : "No verdict until everything is placed."}
            </p>
          </div>
          {complete ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copy}
                className="label rounded-[var(--r-pill)] bg-[var(--accent)] px-5 py-3 text-[var(--on-accent)] transition-transform duration-200 hover:-translate-y-0.5"
              >
                {copied ? "Copied ✓" : "Copy my tier list"}
              </button>
              <button
                type="button"
                onClick={reset}
                className="label rounded-[var(--r-pill)] border border-line px-5 py-3 text-[var(--ink-strong)] transition-colors hover:border-ink/40 hover:text-ink"
              >
                Start over
              </button>
            </div>
          ) : (
            <p className="label max-w-[26ch] text-[var(--ink-muted)]">
              Saved on this device as you go. Nothing is sent anywhere.
            </p>
          )}
        </div>

        {complete ? (
          <ol className="border-t border-line/70">
            {list.tiers.map((tier) => (
              <li
                key={tier.id}
                className="grid gap-1 border-b border-line/50 px-5 py-3 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-4 sm:px-6"
              >
                <span
                  className="label flex items-center gap-2 text-[var(--ink-soft)]"
                  style={{ color: `var(--accent-${tier.accent})` }}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block size-2 rounded-full"
                    style={{ background: `var(--accent-${tier.accent})` }}
                  />
                  {tier.name}
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm leading-relaxed text-[var(--ink-soft)]">
                  {list.items.filter((item) => placements[item.id] === tier.id)
                    .length === 0 ? (
                    <span>—</span>
                  ) : (
                    list.items
                      .filter((item) => placements[item.id] === tier.id)
                      .map((item) => (
                        <span
                          key={item.id}
                          className="inline-flex items-center gap-1.5"
                        >
                          {item.image ? (
                            <img
                              src={siteHref(item.image)}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="size-7 shrink-0 rounded-full bg-surface-2 object-cover"
                            />
                          ) : null}
                          {item.label}
                        </span>
                      ))
                  )}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      {/* Screen-reader announcements -------------------------------- */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* The chip in flight ---------------------------------------- */}
      {flyer ? (
        <div
          key={flyer.id}
          ref={flyerRef}
          aria-hidden="true"
          className="pointer-events-none fixed z-[1000] inline-flex items-center overflow-hidden rounded-[var(--r-pill)] border border-line bg-surface-2 text-[13px] font-medium text-[var(--ink-strong)] shadow-[0_22px_45px_-16px_rgba(0,0,0,0.55)]"
          style={{
            left: flyer.from.left,
            top: flyer.from.top,
            width: flyer.from.width,
            height: flyer.from.height,
            transformOrigin: "top left",
          }}
        >
          {images[flyer.id] ? (
            <img
              src={siteHref(images[flyer.id])}
              alt=""
              className="ml-1.5 size-11 shrink-0 rounded-full bg-surface object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="ml-3.5 inline-block size-1.5 shrink-0 rounded-full bg-ink/25"
            />
          )}
          <span className="truncate px-2">{labels[flyer.id]}</span>
        </div>
      ) : null}

      {/* Drag ghost ------------------------------------------------- */}
      <div
        ref={ghostRef}
        aria-hidden="true"
        className={[
          "pointer-events-none fixed left-0 top-0 z-[999] inline-flex items-center gap-2 rounded-[var(--r-pill)] bg-ink py-1.5 pl-1.5 pr-4 text-[13px] font-semibold text-[var(--on-ink)] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)] transition-[opacity,scale]",
          // The flying chip takes over the instant the pointer is released, so
          // the ghost leaves without a fade that would double up on it.
          dragging
            ? "scale-[1.06] opacity-100 duration-150"
            : "scale-95 opacity-0 duration-0",
        ].join(" ")}
        style={{ transform: "translate3d(-999px, -999px, 0)" }}
      >
        {dragging && images[dragging] ? (
          <img
            src={siteHref(images[dragging])}
            alt=""
            className="size-11 shrink-0 rounded-full object-cover"
          />
        ) : null}
        {dragging ? labels[dragging] : ""}
      </div>
    </div>
  );
}

interface ChipProps {
  itemId: string;
  label: string;
  image?: string;
  selected: boolean;
  dragging: boolean;
  /** Invisible while its flying copy is in the air. */
  hidden?: boolean;
  landing?: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onClick: () => void;
}

function Chip({
  itemId,
  label,
  image,
  selected,
  dragging,
  hidden = false,
  landing = false,
  onPointerDown,
  onClick,
}: ChipProps) {
  return (
    <button
      type="button"
      data-item
      data-item-id={itemId}
      onPointerDown={onPointerDown}
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "qz-tier-chip inline-flex max-w-full touch-none select-none items-center gap-2 rounded-[var(--r-pill)] border py-1.5 text-[13px] font-medium transition-[transform,background-color,border-color,box-shadow,opacity] duration-200 active:cursor-grabbing",
        image ? "pl-1.5 pr-3.5" : "px-3.5 py-2",
        hidden ? "invisible" : "",
        landing ? "qz-tier-chip--land" : "",
        dragging
          ? "scale-95 border-dashed border-ink/25 bg-transparent text-[var(--ink-muted)] opacity-40"
          : selected
            ? "-translate-y-0.5 border-transparent bg-[var(--accent)] text-[var(--on-accent)] shadow-[0_6px_18px_-8px_var(--accent)]"
            : "border-line bg-surface-2 text-[var(--ink-strong)] hover:-translate-y-0.5 hover:border-ink/35 hover:text-ink hover:shadow-[0_8px_20px_-14px_rgba(0,0,0,0.8)]",
      ].join(" ")}
    >
      {image ? (
        <img
          src={siteHref(image)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-11 shrink-0 rounded-full bg-surface object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className={[
            "inline-block size-1.5 rounded-full transition-colors",
            selected ? "bg-current" : "bg-ink/25",
          ].join(" ")}
        />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}
