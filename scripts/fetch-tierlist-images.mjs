#!/usr/bin/env node
/* Downloads character portraits for the JJK tier list from the Jujutsu Kaisen
   Wiki (Fandom), crops them to a small square and writes compressed WebP files
   plus a credits file. Run again to refresh the artwork. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const LIST = "content/tierlists/jjk-curses-to-befriend.json";
const OUT = "public/images/tierlists/jjk";
const PX = 112; // displayed at 28–40px, so this covers 2x screens

/* Item id → wiki page title. */
const PAGES = {
  sukuna: "Sukuna",
  mahito: "Mahito",
  jogo: "Jogo",
  hanami: "Hanami",
  dagon: "Dagon",
  choso: "Choso",
  eso: "Eso",
  kechizu: "Kechizu",
  kenjaku: "Kenjaku",
  uraume: "Uraume",
  rika: "Rika Orimoto",
  naoya: "Naoya Zenin",
  ogami: "Ogami",
  kurourushi: "Kurourushi",
  smallpox: "Smallpox Deity",
  ganesha: "Ganesha",
  "finger-bearer": "Finger Bearer",
  grasshopper: "Ko-Guy",
  "cursed-womb": "Cursed Womb: Death Painting",
  "cursed-corpse": "Cursed Corpse",
  haruta: "Haruta Shigemo",
};

const api = new URL("https://jujutsu-kaisen.fandom.com/api.php");
api.search = new URLSearchParams({
  action: "query",
  titles: Object.values(PAGES).join("|"),
  prop: "pageimages",
  pithumbsize: "400",
  format: "json",
  redirects: "1",
}).toString();

const response = await fetch(api);
if (!response.ok) throw new Error(`Wiki API returned ${response.status}`);
const data = await response.json();

const thumbFor = new Map();
for (const page of Object.values(data.query.pages)) {
  if (page.thumbnail) thumbFor.set(page.title, page.thumbnail.source);
}
for (const redirect of data.query.redirects ?? []) {
  const source = thumbFor.get(redirect.to);
  if (source) thumbFor.set(redirect.from, source);
}

await mkdir(OUT, { recursive: true });
const credits = {};
const missing = [];

for (const [id, page] of Object.entries(PAGES)) {
  const source = thumbFor.get(page);
  if (!source) {
    missing.push(`${id} (${page})`);
    continue;
  }

  const image = await fetch(source);
  if (!image.ok) throw new Error(`${page}: image ${image.status}`);
  const buffer = new Uint8Array(await image.arrayBuffer());

  const file = `${id}.webp`;
  await sharp(buffer)
    .resize(PX, PX, { fit: "cover", position: sharp.strategy.attention })
    .webp({ quality: 70, effort: 6 })
    .toFile(path.join(OUT, file));

  credits[file] = {
    character: page,
    source,
    page: `https://jujutsu-kaisen.fandom.com/wiki/${encodeURIComponent(page.replaceAll(" ", "_"))}`,
    licence: "© Gege Akutami / Shueisha / MAPPA — character artwork from the Jujutsu Kaisen Wiki, used for identification on a non-commercial fan project.",
  };
  console.log(`✓ ${file}`);
}

if (missing.length) console.warn(`No image for: ${missing.join(", ")}`);

await writeFile(
  path.join(OUT, "credits.json"),
  `${JSON.stringify(credits, null, 2)}\n`,
);

/* Write the image paths back into the tier list so the board can use them. */
const listPath = path.join(process.cwd(), LIST);
const list = JSON.parse(await readFile(listPath, "utf8"));
for (const item of list.items) {
  if (credits[`${item.id}.webp`]) {
    item.image = `/images/tierlists/jjk/${item.id}.webp`;
  }
}
await writeFile(listPath, `${JSON.stringify(list, null, 2)}\n`);
console.log("Tier list updated with image paths.");
