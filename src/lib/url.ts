/**
 * Absolute paths that respect Astro's configured `base` (GitHub Pages serves
 * this site from `/quizzy/`, local dev from `/`). Always use this instead of a
 * bare `"/quiz/..."` string so the build works under either root.
 */
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export function siteHref(path: string): string {
  return `${base}${path}`;
}
