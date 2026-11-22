/**
 * Text colour for content painted directly on an accent fill.
 *
 * Most accents are bright enough for near-black text, but the deep violet
 * would swallow it, so it gets white instead. Kept in one place so cards,
 * category tiles and the quiz player all agree.
 */
const NEEDS_LIGHT_TEXT = new Set(["purple"]);

export function onAccentInk(accent: string): string {
  return NEEDS_LIGHT_TEXT.has(accent) ? "#ffffff" : "#141414";
}
