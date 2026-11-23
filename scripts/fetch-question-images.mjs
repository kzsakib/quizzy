/**
 * Refresh the picture-question photos from their recorded open-licence
 * sources. Every image is a real, freely licensed photograph — none are
 * generated art.
 *
 *   node scripts/fetch-question-images.mjs          # only missing files
 *   node scripts/fetch-question-images.mjs --force  # re-download everything
 *
 * `public/images/questions/credits.json` is the manifest: it records the
 * Commons/Openverse title, creator, licence and source page for each photo.
 * Commons is the primary source (descriptive file titles and clean licence
 * metadata); Openverse is a good alternative aggregator:
 *   https://api.openverse.org/v1/images/?q=front%20door&license_type=commercial
 *
 * Wikimedia asks clients to be polite: this script makes one request per file
 * and waits between them.
 */
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "public", "images", "questions");
const CREDITS = path.join(OUT_DIR, "credits.json");
const force = process.argv.includes("--force");
const UA = "QuizzyQuizImagePicker/0.1 (personality quiz demo)";

const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function commonsImage(title) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("titles", `File:${title.replace(/^File:/, "")}`);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|extmetadata");
  url.searchParams.set("iiurlwidth", "900");

  const response = await fetch(url, { headers: { "user-agent": UA } });
  if (!response.ok) throw new Error(`Commons ${response.status}`);

  const pages = Object.values((await response.json())?.query?.pages ?? {});
  const info = pages[0]?.imageinfo?.[0];
  if (!info?.thumburl) throw new Error("no image info");
  return info.thumburl;
}

async function download(url) {
  const response = await fetch(url, { headers: { "user-agent": UA } });
  if (!response.ok) throw new Error(`download ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const credits = JSON.parse(await readFile(CREDITS, "utf8"));
let fetched = 0;

for (const entry of credits) {
  const file = path.join(OUT_DIR, path.basename(entry.file));

  if (!force && (await exists(file))) {
    console.log(`skip  ${path.basename(file)}`);
    continue;
  }

  if (!entry.source?.includes("commons.wikimedia.org")) {
    console.log(`manual ${path.basename(file)} (${entry.source})`);
    continue;
  }

  try {
    const url = await commonsImage(entry.title);
    await writeFile(file, await download(url));
    console.log(`ok    ${path.basename(file)}  <- ${entry.title}`);
    fetched += 1;
  } catch (error) {
    console.error(`fail  ${path.basename(file)}: ${String(error)}`);
  }

  await sleep(3000);
}

console.log(`\n${fetched} file(s) downloaded, ${credits.length} in credits.json`);
