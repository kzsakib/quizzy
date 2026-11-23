/**
 * Shrink the picture-question photos.
 *
 * The cards render at most ~400 CSS px wide, so an 800px JPEG is plenty even
 * on a 2x screen. Resizing + mozjpeg here keeps the repository (and the Pages
 * artefact) small without a build step.
 *
 *   node scripts/optimize-question-images.mjs
 *
 * Safe to re-run: an already-small file is left alone.
 */
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DIR = path.join(process.cwd(), "public", "images", "questions");
const MAX_WIDTH = 800;
const QUALITY = 74;

const files = (await readdir(DIR)).filter((file) => /\.(jpe?g|png)$/i.test(file));
let before = 0;
let after = 0;

for (const file of files) {
  const full = path.join(DIR, file);
  const original = await stat(full);
  before += original.size;

  const image = sharp(full).rotate();
  const meta = await image.metadata();

  const buffer = await image
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true, progressive: true })
    .toBuffer();

  if (buffer.length < original.size) {
    await writeFile(full, buffer);
    after += buffer.length;
    console.log(
      `slim  ${file.padEnd(32)} ${Math.round(original.size / 1024)}kB -> ${Math.round(buffer.length / 1024)}kB  ${meta.width}px wide`,
    );
  } else {
    after += original.size;
    console.log(`keep  ${file.padEnd(32)} ${Math.round(original.size / 1024)}kB`);
  }
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
console.log(`\n${files.length} images: ${mb(before)} MB -> ${mb(after)} MB`);
