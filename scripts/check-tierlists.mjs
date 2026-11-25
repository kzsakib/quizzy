#!/usr/bin/env node
/* Validates every tier list in content/tierlists.
   Rules: 4–6 tiers, 20–40 items, unique ids, no S/A/B letter tiers, tier
   accents must exist, and every list needs a unique slug. */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const dir = path.join(process.cwd(), "content/tierlists");
const ACCENTS = new Set([
  "yellow",
  "purple",
  "red",
  "sky",
  "lime",
  "pink",
  "green",
  "cyan",
  "blue",
  "orange",
]);
const LETTER_TIER = /^[sabcdf][+-]?$/i;

const files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
const errors = [];
const slugs = new Set();

for (const file of files.sort()) {
  const raw = await readFile(path.join(dir, file), "utf8");
  let list;
  try {
    list = JSON.parse(raw);
  } catch (error) {
    errors.push(`${file}: invalid JSON (${error.message})`);
    continue;
  }

  const at = (message) => errors.push(`${file}: ${message}`);

  if (!list.slug) at("missing slug");
  else if (list.slug !== file.replace(/\.json$/, ""))
    at(`slug "${list.slug}" does not match the file name`);
  else if (slugs.has(list.slug)) at(`duplicate slug "${list.slug}"`);
  else slugs.add(list.slug);

  for (const field of ["title", "dek", "kicker", "category", "emoji", "published"])
    if (!list[field]) at(`missing ${field}`);
  if (!ACCENTS.has(list.accent)) at(`unknown accent "${list.accent}"`);

  const tiers = Array.isArray(list.tiers) ? list.tiers : [];
  if (tiers.length < 4 || tiers.length > 6)
    at(`${tiers.length} tiers (needs 4–6)`);

  const tierIds = new Set();
  for (const tier of tiers) {
    if (!tier.id || !tier.name || !tier.note) at(`tier missing id/name/note`);
    if (tierIds.has(tier.id)) at(`duplicate tier id "${tier.id}"`);
    tierIds.add(tier.id);
    if (LETTER_TIER.test(String(tier.name).trim()))
      at(`tier "${tier.name}" is a letter grade — give it a personality`);
    if (!ACCENTS.has(tier.accent)) at(`tier "${tier.name}" has unknown accent`);
  }

  const items = Array.isArray(list.items) ? list.items : [];
  if (items.length < 20 || items.length > 40)
    at(`${items.length} items (needs 20–40)`);

  const itemIds = new Set();
  for (const item of items) {
    if (!item.id || !item.label) at("item missing id/label");
    if (itemIds.has(item.id)) at(`duplicate item id "${item.id}"`);
    itemIds.add(item.id);
  }
}

if (errors.length) {
  console.error(`Tier lists: ${errors.length} problem(s)\n`);
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

console.log(`Tier lists OK — ${files.length} lists validated.`);
