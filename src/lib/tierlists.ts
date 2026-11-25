import type { TierList } from "./tierlists-types";

/* Tier lists live as plain JSON in /content/tierlists, same as quizzes. */
const modules = import.meta.glob<{ default: TierList }>(
  "/content/tierlists/*.json",
  { eager: true },
);

export const tierLists: TierList[] = Object.values(modules)
  .map((module) => module.default)
  .sort((a, b) => (a.published ?? "").localeCompare(b.published ?? "") || a.title.localeCompare(b.title));

export function getTierList(slug: string): TierList | undefined {
  return tierLists.find((list) => list.slug === slug);
}

export function otherTierLists(slug: string, limit = 3): TierList[] {
  return tierLists.filter((list) => list.slug !== slug).slice(0, limit);
}

export type { TierList, Tier, TierItem } from "./tierlists-types";
