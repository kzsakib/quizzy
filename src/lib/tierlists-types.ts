/** Shared shapes for the tier-list section. Kept free of Vite imports so the
 *  React island can import the types without pulling in every JSON file. */
export interface Tier {
  id: string;
  name: string;
  note: string;
  accent: string;
}

export interface TierItem {
  id: string;
  label: string;
}

export interface TierList {
  slug: string;
  title: string;
  dek: string;
  kicker: string;
  category: string;
  accent: string;
  emoji: string;
  published: string;
  tiers: Tier[];
  items: TierItem[];
}
