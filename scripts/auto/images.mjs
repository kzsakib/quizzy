/**
 * Picture-question photos.
 *
 * Every quiz needs one "pick an image" question with four real, openly
 * licensed photographs. We search Wikimedia Commons (no key, clean licence
 * metadata), keep only JPEGs that are big enough, download Commons' own 800px
 * thumbnail, and record creator + licence + source page in credits.json.
 *
 * If a search comes up empty or the download doesn't look like a JPEG, we fall
 * back to a photo already in the library (matched against the option text), so
 * a quiz can never ship with a broken image.
 */
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.join(process.cwd(), "public", "images", "questions");
const CREDITS = path.join(OUT_DIR, "credits.json");
const UA = "QuizzyQuizFactory/1.0 (personality quiz site)";

const OK_LICENCE =
  /^(cc0|pd|public domain|cc[ -]?by|cc[ -]?by[ -]?sa|cc[ -]?by[ -]?3\.0|cc[ -]?by[ -]?4\.0)/i;
const BAD_TITLE =
  /logo|diagram|chart|map\b|poster|cover|screenshot|icon|seal|coat of arms|flag of|svg|signature/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const stripHtml = (value = "") =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

export function readCredits() {
  return readFile(CREDITS, "utf8").then((raw) => JSON.parse(raw));
}

export async function writeCredits(entries) {
  await writeFile(CREDITS, `${JSON.stringify(entries, null, 2)}\n`);
}

/** Commons search -> best licensed JPEG candidate, or null. */
async function searchCommons(query) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `filetype:bitmap ${query}`);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "20");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|extmetadata|mime|size");
  url.searchParams.set("iiurlwidth", "800");

  const response = await fetch(url, { headers: { "user-agent": UA } });
  if (!response.ok) throw new Error(`Commons search ${response.status}`);
  const pages = Object.values((await response.json())?.query?.pages ?? {});

  const words = query
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 4);

  const candidates = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info?.thumburl) continue;
    if (info.mime !== "image/jpeg") continue;
    if (!info.width || info.width < 800 || (info.height ?? 0) < 500) continue;
    const title = page.title.replace(/^File:/, "");
    if (BAD_TITLE.test(title)) continue;

    const license = stripHtml(info.extmetadata?.LicenseShortName?.value);
    if (!license || !OK_LICENCE.test(license)) continue;

    // Relevance guard: at least one meaningful query word must appear in the
    // file title, otherwise Commons tends to hand back something unrelated.
    const haystack = `${title} ${stripHtml(info.extmetadata?.ImageDescription?.value)}`.toLowerCase();
    const matches = words.filter((word) => haystack.includes(word)).length;
    if (words.length && matches === 0) continue;

    candidates.push({
      title,
      url: info.thumburl,
      license,
      creator: stripHtml(info.extmetadata?.Artist?.value).replace(/\s+/g, " ").slice(0, 120),
      source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title.replace(/ /g, "_"))}`,
      score: matches,
      width: info.width,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

async function download(url) {
  const response = await fetch(url, { headers: { "user-agent": UA } });
  if (!response.ok) throw new Error(`download ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 12_000 || buffer.length > 900_000) {
    throw new Error(`unexpected image size ${buffer.length}`);
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error("not a JPEG");
  return buffer;
}

const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

/** Pick an already-downloaded photo whose credit text matches the option. */
function pickReused(credits, option, usedFiles) {
  const words = `${option.label} ${option.imageSearch ?? ""}`
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 4);

  const ranked = credits
    .filter((credit) => !usedFiles.has(credit.file))
    .map((credit) => {
      const haystack = `${credit.title} ${credit.alt ?? ""}`.toLowerCase();
      const score = words.filter((word) => haystack.includes(word)).length;
      return { credit, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.credit ?? null;
}

/**
 * Resolve one image option to a real file + credit entry.
 * Returns { image, alt, credit, source: "commons" | "reused" }.
 */
export async function sourceImage({ slug, optionId, option, credits, usedFiles }) {
  const query = option.imageSearch?.trim() || option.label;
  const fileName = `${slug}-${optionId}.jpg`;
  const relative = `/images/questions/${fileName}`;

  // Already downloaded earlier in this run (retry after a failed validation).
  const existing = credits.find((credit) => credit.file === relative);
  if (existing && (await exists(path.join(OUT_DIR, fileName)))) {
    return { image: relative, alt: existing.alt, credit: existing, source: "commons" };
  }

  if (query) {
    try {
      await sleep(400); // be polite to Commons
      const candidate = await searchCommons(query);
      if (candidate) {
        const raw = await download(candidate.url);
        // Commons' own 800px thumb is often 200-500 kB. Re-encode to the same
        // 800px / q74 house settings so one photo stays around 60-90 kB.
        const buffer = await sharp(raw)
          .rotate()
          .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 74, mozjpeg: true, progressive: true })
          .toBuffer();
        await writeFile(path.join(OUT_DIR, fileName), buffer);
        const credit = {
          file: relative,
          title: candidate.title,
          creator: candidate.creator || "Unknown",
          license: candidate.license,
          source: candidate.source,
          alt: option.alt || option.label,
        };
        return { image: relative, alt: credit.alt, credit, source: "commons" };
      }
    } catch (error) {
      console.warn(`  image: commons miss for "${query}" (${error.message})`);
    }
  }

  const reused = pickReused(credits, option, usedFiles);
  if (!reused) throw new Error(`no image available for ${slug}/${optionId}`);
  if (!(await exists(path.join(OUT_DIR, path.basename(reused.file))))) {
    throw new Error(`reused image missing on disk: ${reused.file}`);
  }
  usedFiles.add(reused.file);
  return { image: reused.file, alt: reused.alt, credit: reused, source: "reused" };
}
