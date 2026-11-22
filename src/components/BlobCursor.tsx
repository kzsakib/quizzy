import { useEffect, useRef } from "react";

interface Props {
  /** `chrome` adds a brighter rim; `ink` is the flatter, softer blob. */
  material?: "chrome" | "ink";
  /** Accent tint for the rim and the click splashes. */
  color?: string;
  size?: number;
  /** How quickly the blob changes shape while moving. */
  morphSpeed?: number;
  /** 0 = glued to the pointer, 1 = very lazy. */
  lag?: number;
  /** How long a splash droplet hangs before it falls. */
  drip?: number;
  splashCount?: number;
  splashSpeed?: number;
  splashGravity?: number;
}

/**
 * A soft blob that trails the pointer and inverts everything behind it.
 *
 * The inversion is real, not a translucent tint: the blob is painted white
 * with `mix-blend-mode: difference`, so the compositor subtracts it from the
 * page underneath. Edges fade out through a radial gradient, which keeps the
 * effect from looking like a hard sticker.
 */
export default function BlobCursor({
  material = "ink",
  color = "#3B82F6",
  size = 48,
  morphSpeed = 0.5,
  lag = 0.72,
  drip = 0.5,
  splashCount = 12,
  splashSpeed = 0.6,
  splashGravity = 0.4,
}: Props) {
  const blobRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const blob = blobRef.current;
    if (!blob) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const root = document.documentElement;
    root.classList.add("has-blob-cursor");

    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const pos = { ...target };
    let last = { ...target };
    let speed = 0;
    let visible = false;
    let frame = 0;
    const drops: {
      el: HTMLSpanElement;
      x: number;
      y: number;
      vx: number;
      vy: number;
      born: number;
      life: number;
      size: number;
    }[] = [];

    const spawnSplash = (x: number, y: number) => {
      const count = Math.max(3, Math.round(splashCount));
      for (let i = 0; i < count; i += 1) {
        const el = document.createElement("span");
        el.className = "blob-cursor__drop";
        el.setAttribute("aria-hidden", "true");
        const scale = 0.35 + Math.random() * 0.9;
        const dropSize = Math.round(size * 0.16 * scale);
        el.style.width = `${dropSize}px`;
        el.style.height = `${dropSize}px`;
        el.style.background =
          Math.random() > 0.5
            ? "radial-gradient(circle at 40% 35%, #fff, rgb(255 255 255 / 0.2))"
            : `radial-gradient(circle at 40% 35%, ${color}, rgb(255 255 255 / 0))`;
        document.body.appendChild(el);
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const force = splashSpeed * (60 + Math.random() * 110);
        drops.push({
          el,
          x,
          y,
          vx: Math.cos(angle) * force,
          vy: Math.sin(angle) * force * 0.65 - 40,
          born: performance.now(),
          life: 460 + drip * 700 + Math.random() * 240,
          size: dropSize,
        });
      }
    };

    const onMove = (event: PointerEvent) => {
      target.x = event.clientX;
      target.y = event.clientY;
      if (!visible) {
        visible = true;
        pos.x = target.x;
        pos.y = target.y;
        blob.style.opacity = "1";
      }
    };
    const onLeave = () => {
      visible = false;
      blob.style.opacity = "0";
    };
    const onDown = (event: PointerEvent) => {
      spawnSplash(event.clientX, event.clientY);
    };

    const ease = 1 - Math.min(Math.max(lag, 0.05), 0.97);
    let previous = performance.now();

    const tick = (now: number) => {
      const delta = Math.min(Math.max(now - previous, 8), 48) / 16.67;
      previous = now;

      pos.x += (target.x - pos.x) * Math.min(ease * delta, 1);
      pos.y += (target.y - pos.y) * Math.min(ease * delta, 1);

      const dx = pos.x - last.x;
      const dy = pos.y - last.y;
      const step = Math.hypot(dx, dy);
      speed += (step - speed) * 0.16;
      last = { x: pos.x, y: pos.y };

      const t = now * 0.001 * (0.4 + morphSpeed);
      const stretch = Math.min(speed / 42, 1);
      const lean = Math.atan2(dy, dx) * (180 / Math.PI);
      const wobble = Math.sin(t * 1.7) * (2.5 + stretch * 7);
      const wobble2 = Math.cos(t * 1.3 + 1.2) * (2.5 + stretch * 6);
      const scale = 1 + Math.min(speed / 120, 0.18);
      const angle = speed > 1.2 ? lean : 0;

      blob.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%) rotate(${angle}deg) scale(${scale}, ${1 / scale})`;
      blob.style.borderRadius = `${46 + wobble}% ${54 - wobble}% ${52 + wobble2}% ${
        48 - wobble2
      }% / ${52 - wobble2}% ${46 + wobble}% ${54 - wobble}% ${48 + wobble2}%`;
      blob.dataset.moving = stretch > 0.12 ? "true" : "false";

      for (let i = drops.length - 1; i >= 0; i -= 1) {
        const drop = drops[i];
        const age = now - drop.born;
        const life = Math.min(age / drop.life, 1);
        drop.vy += 0.9 * splashGravity * delta;
        drop.vx *= 0.985;
        drop.x += drop.vx * 0.016 * delta;
        drop.y += drop.vy * 0.016 * delta;
        drop.el.style.transform = `translate3d(${drop.x}px, ${drop.y}px, 0) translate(-50%, -50%) scale(${1 - life * 0.35})`;
        drop.el.style.opacity = `${Math.max(0, 1 - life) * 0.95}`;
        if (life >= 1) {
          drop.el.remove();
          drops.splice(i, 1);
        }
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerleave", onLeave);
      root.classList.remove("has-blob-cursor");
      drops.forEach((drop) => drop.el.remove());
    };
  }, [color, drip, lag, morphSpeed, size, splashCount, splashGravity, splashSpeed]);

  return (
    <div
      ref={blobRef}
      aria-hidden="true"
      className="blob-cursor"
      data-material={material}
      style={{
        width: size,
        height: size,
        opacity: 0,
        transition: "opacity 260ms ease",
        boxShadow:
          material === "chrome"
            ? `inset 0 0 0 1.5px rgb(255 255 255 / 0.9), 0 0 24px 2px ${color}`
            : undefined,
      }}
    />
  );
}
