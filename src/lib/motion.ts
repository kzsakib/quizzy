import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { Flip } from "gsap/Flip";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger, SplitText, Flip);

export { gsap, ScrollTrigger, SplitText, Flip };

let lenis: Lenis | null = null;
let started = false;

/** The live Lenis instance (null when smooth scrolling is disabled). */
export function getLenis(): Lenis | null {
  return lenis;
}

/**
 * Initialise smooth scrolling exactly once and hand the RAF loop to GSAP so
 * Lenis and ScrollTrigger never disagree about scroll position.
 *
 * Motion is always on: the OS `prefers-reduced-motion` flag is deliberately
 * ignored so every animation plays for every visitor.
 */
export function initSmoothScroll(): Lenis | null {
  if (typeof window === "undefined" || lenis) return lenis;

  lenis = new Lenis({
    duration: 1.05,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 1.4,
    autoRaf: false,
    anchors: false,
    // Lenis 1.3 silently switches smoothing off when the OS asks for reduced
    // motion. This site wants the same scroll feel for everyone.
    respectReducedMotion: false,
  });

  lenis.on("scroll", ScrollTrigger.update);

  gsap.ticker.add((time) => {
    lenis?.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  return lenis;
}

/** Scroll to an element or offset, falling back to native behaviour. */
export function scrollToTarget(
  target: string | number | HTMLElement,
  offset = -88,
): void {
  if (lenis) {
    lenis.scrollTo(target, { offset, duration: 1.1 });
    return;
  }

  if (typeof target === "number") {
    window.scrollTo({ top: target + offset, behavior: "auto" });
    return;
  }

  const el =
    typeof target === "string" ? document.querySelector(target) : target;
  if (!(el instanceof HTMLElement)) return;

  const top = el.getBoundingClientRect().top + window.scrollY + offset;
  window.scrollTo({ top, behavior: "auto" });
}

export function stopScroll(): void {
  lenis?.stop();
}

export function startScroll(): void {
  lenis?.start();
}

/** In-page anchors go through Lenis so the easing stays consistent. */
function bindAnchorLinks(): void {
  document.addEventListener("click", (event) => {
    const anchor = (event.target as HTMLElement | null)?.closest?.(
      'a[href^="#"]',
    );
    if (!(anchor instanceof HTMLAnchorElement)) return;

    const hash = anchor.getAttribute("href");
    if (!hash || hash === "#") return;

    const target = document.querySelector(hash);
    if (!target) return;

    event.preventDefault();
    scrollToTarget(target as HTMLElement);
    history.replaceState(null, "", hash);
  });
}

const REVEAL_FROM = { opacity: 0, y: 26, scale: 0.985 } as const;
const REVEAL_TO = {
  opacity: 1,
  y: 0,
  scale: 1,
  duration: 0.72,
  ease: "power3.out",
  stagger: 0.07,
  overwrite: true,
} as const;

/**
 * Staggered fade/scale reveal for anything marked `data-reveal`.
 *
 * Everything already on screen animates by itself the moment the page boots;
 * the rest plays automatically as soon as it enters the viewport (batched by
 * ScrollTrigger so offscreen items do not each get their own trigger).
 */
export function revealOnScroll(selector = "[data-reveal]"): void {
  const items = gsap.utils.toArray<HTMLElement>(selector);
  if (!items.length) return;

  gsap.set(items, REVEAL_FROM);

  const fold = window.innerHeight * 0.92;
  const onScreen: HTMLElement[] = [];
  const below: HTMLElement[] = [];

  for (const item of items) {
    (item.getBoundingClientRect().top < fold ? onScreen : below).push(item);
  }

  if (onScreen.length) gsap.to(onScreen, REVEAL_TO);

  if (!below.length) return;

  ScrollTrigger.batch(below, {
    start: "top 92%",
    once: true,
    onEnter: (batch) => gsap.to(batch, REVEAL_TO),
  });
}

/** Boot the global motion layer. Safe to call once per page. */
export function initMotion(): void {
  if (typeof window === "undefined" || started) return;
  started = true;

  initSmoothScroll();
  bindAnchorLinks();
  revealOnScroll();

  // Web fonts change line boxes, which moves every trigger.
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }

  window.addEventListener("load", () => ScrollTrigger.refresh(), {
    once: true,
  });
}
