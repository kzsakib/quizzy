#!/usr/bin/env node
/**
 * QUIZZY auto-quiz factory.
 *
 *   node scripts/auto/generate.mjs --count=3            # normal run
 *   node scripts/auto/generate.mjs --count=3 --force    # ignore the 6h guard
 *   node scripts/auto/generate.mjs --count=1 --stub     # no API calls, pipeline test
 *
 * Flow: ideas -> quiz JSON -> validate (repair loop) -> source four Commons
 * photos -> write files + credits -> record state. The workflow then runs the
 * site's own validator and build before committing anything.
 *
 * Exits non-zero only when nothing usable was produced, so a single stubborn
 * topic can never take the whole run down.
 */
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { questionTraits } from "../../src/lib/scoring.ts";
import { buildIdeasPrompt, buildQuizPrompt, buildRepairPrompt } from "./prompt.mjs";
import { askModel, askStub } from "./providers.mjs";
import { research, researchLine } from "./research.mjs";
import { readCredits, writeCredits, sourceImage } from "./images.mjs";

const ROOT = process.cwd();
const QUIZ_DIR = path.join(ROOT, "content", "quizzes");
const AUTO_DIR = path.join(ROOT, "content", "auto");
const LAST_RUN = path.join(AUTO_DIR, "last-run.json");
const TOPIC_LOG = path.join(AUTO_DIR, "topics-used.json");

const GUARD_HOURS = 6;
const MAX_ATTEMPTS = 3;

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const has = (name) => args.includes(`--${name}`);

const count = Math.max(1, Math.min(5, Number(flag("count", process.env.COUNT || 3))));
const force = flag("force", process.env.FORCE ?? "false") === "true";
const stub = has("stub");

const today = new Date().toISOString().slice(0, 10);
const callModel = stub ? askStub : askModel;

const log = (...parts) => console.log(...parts);

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function parseJsonLoose(raw) {
  let text = String(raw ?? "").trim();
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(text.slice(start, end + 1));
  }
  throw new Error("response contained no JSON object");
}

const slugify = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const words = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);

function titleOverlap(a, b) {
  const left = new Set(words(a));
  const right = new Set(words(b));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function validateQuiz(quiz, existing, accents) {
  const errors = [];
  const need = (condition, message) => {
    if (!condition) errors.push(message);
  };

  need(quiz && typeof quiz === "object" && !Array.isArray(quiz), "top level must be an object");
  if (errors.length) return errors;

  need(typeof quiz.title === "string" && quiz.title.length >= 12 && quiz.title.length <= 68,
    `title must be 12-68 characters (got ${String(quiz.title ?? "").length})`);
  need(typeof quiz.dek === "string" && quiz.dek.length >= 40 && quiz.dek.length <= 210,
    `dek must be 40-210 characters (got ${String(quiz.dek ?? "").length})`);
  need(typeof quiz.category === "string" && quiz.category.trim().length > 1, "missing category");
  need(typeof quiz.emoji === "string" && quiz.emoji.trim().length > 0, "missing emoji");
  need(Number.isFinite(quiz.minutes) && quiz.minutes >= 3 && quiz.minutes <= 6, "minutes must be 3-6");
  need(accents.includes(quiz.accent), `accent "${quiz.accent}" is not one used on the site`);

  const slug = slugify(quiz.slug || quiz.title);
  need(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 6, "slug must be kebab-case, 6+ chars");
  need(!existing.slugs.has(slug), `slug "${slug}" already exists`);

  if (quiz.title) {
    for (const other of existing.titles) {
      if (titleOverlap(quiz.title, other) > 0.65) {
        errors.push(`title is too close to an existing quiz: "${other}"`);
        break;
      }
    }
  }

  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  const results = Array.isArray(quiz.results) ? quiz.results : [];
  need(questions.length === 12, `need exactly 12 questions (got ${questions.length})`);
  need(results.length === 6, `need exactly 6 results (got ${results.length})`);
  if (errors.length) return errors;

  const traits = results.map((result) => result.trait);
  need(new Set(traits).size === 6, "the 6 results must have 6 distinct traits");
  for (const trait of traits) {
    need(typeof trait === "string" && /^[a-z][a-z0-9_]*$/.test(trait), `bad trait id "${trait}"`);
  }
  const traitSet = new Set(traits);
  need(typeof quiz.tiebreaker === "string" && questions.some((q) => q.id === quiz.tiebreaker),
    "tiebreaker must point at a real question id");

  for (const result of results) {
    need(typeof result.name === "string" && result.name.length >= 2, `result ${result.trait}: missing name`);
    need(typeof result.tagline === "string" && result.tagline.length >= 8, `result ${result.trait}: missing tagline`);
    need(typeof result.blurb === "string" && result.blurb.length >= 120, `result ${result.trait}: blurb too short`);
    need(Array.isArray(result.strengths) && result.strengths.length === 3, `result ${result.trait}: need 3 strengths`);
    need(typeof result.watchOut === "string" && result.watchOut.length >= 20, `result ${result.trait}: missing watchOut`);
    need(accents.includes(result.accent), `result ${result.trait}: bad accent "${result.accent}"`);

    const mix = result.mix ?? {};
    const mixKeys = Object.keys(mix);
    const sum = Object.values(mix).reduce((total, value) => total + Number(value || 0), 0);
    need(mixKeys.length === 6, `result ${result.trait}: mix must list all 6 traits`);
    need(sum === 100, `result ${result.trait}: mix sums to ${sum}, not 100`);
    const own = Number(mix[result.trait] ?? 0);
    const highest = Math.max(...Object.values(mix).map(Number));
    need(own === highest, `result ${result.trait}: its own share must be the largest in mix`);
  }

  for (const result of results) {
    const name = String(result.name ?? "").trim();
    if (name.length > 3) {
      const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (pattern.test(quiz.title ?? "") || pattern.test(quiz.dek ?? "")) {
        errors.push(`title/dek leaks the result name "${name}"`);
      }
    }
  }

  const typeCount = {};
  const ids = new Set();
  const coverage = Object.fromEntries(traits.map((trait) => [trait, 0]));

  const checkWeights = (weights, where) => {
    if (!weights || typeof weights !== "object") {
      errors.push(`${where}: missing weights`);
      return;
    }
    const entries = Object.entries(weights);
    if (!entries.length) errors.push(`${where}: empty weights`);
    for (const [trait, value] of entries) {
      if (!traitSet.has(trait)) errors.push(`${where}: unknown trait "${trait}"`);
      if (!Number.isFinite(Number(value)) || Number(value) <= 0 || Number(value) > 3) {
        errors.push(`${where}: weight for "${trait}" must be between 0.5 and 3`);
      }
    }
  };

  for (const question of questions) {
    if (!question || typeof question.id !== "string") {
      errors.push("a question has no id");
      continue;
    }
    if (ids.has(question.id)) errors.push(`duplicate question id ${question.id}`);
    ids.add(question.id);
    typeCount[question.type] = (typeCount[question.type] ?? 0) + 1;
    if (!question.prompt || String(question.prompt).length > 120) {
      errors.push(`${question.id}: prompt missing or too long`);
    }

    if (question.type === "mc" || question.type === "this_or_that" || question.type === "image") {
      const options = Array.isArray(question.options) ? question.options : [];
      const want = question.type === "this_or_that" ? 2 : 4;
      if (options.length !== want) errors.push(`${question.id}: ${question.type} needs ${want} options`);
      for (const option of options) {
        checkWeights(option.weights, `${question.id}/${option.id}`);
        if (!option.label) errors.push(`${question.id}/${option.id}: missing label`);
        if (question.type === "image") {
          // Before images are sourced we need a search phrase; afterwards we
          // need the file itself. Both stages need alt text.
          if (!option.imageSearch && !option.image) {
            errors.push(`${question.id}/${option.id}: missing imageSearch`);
          }
          if (!option.alt) errors.push(`${question.id}/${option.id}: missing alt`);
        }
      }
    } else if (question.type === "intensity") {
      need(traitSet.has(question.trait), `${question.id}: unknown trait`);
      need(Boolean(question.low && question.high), `${question.id}: intensity needs low and high labels`);
    } else if (question.type === "spectrum") {
      need(traitSet.has(question.disagree?.trait), `${question.id}: bad disagree trait`);
      need(traitSet.has(question.agree?.trait), `${question.id}: bad agree trait`);
    } else if (question.type === "agreement") {
      need(traitSet.has(question.agree?.trait), `${question.id}: bad agree trait`);
      need(traitSet.has(question.disagree?.trait), `${question.id}: bad disagree trait`);
      need(Number(question.agree?.weight) > 0 && Number(question.disagree?.weight) > 0,
        `${question.id}: agreement weights must be positive`);
    } else if (question.type === "map") {
      for (const axis of [question.x, question.y]) {
        for (const pole of [axis?.low, axis?.high]) {
          need(traitSet.has(pole?.trait), `${question.id}: bad map trait`);
          need(Boolean(pole?.label), `${question.id}: map pole without label`);
        }
      }
      for (const corner of ["lowLow", "lowHigh", "highLow", "highHigh"]) {
        need(Boolean(question.quadrants?.[corner]), `${question.id}: quadrant ${corner} missing`);
      }
    } else if (question.type === "rank") {
      const items = Array.isArray(question.items) ? question.items : [];
      if (items.length < 3 || items.length > 6) errors.push(`${question.id}: rank needs 3-6 items`);
      for (const item of items) checkWeights(item.weights, `${question.id}/${item.id}`);
    } else if (question.type === "madlibs") {
      const blanks = Array.isArray(question.blanks) ? question.blanks : [];
      const gaps = [...String(question.template ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const blankIds = blanks.map((blank) => blank.id);
      if (gaps.join(",") !== blankIds.join(",")) {
        errors.push(`${question.id}: template gaps ${gaps.join("/")} do not match blanks ${blankIds.join("/")}`);
      }
      for (const blank of blanks) {
        if (!Array.isArray(blank.options) || blank.options.length < 2) {
          errors.push(`${question.id}/${blank.id}: needs 2+ options`);
        }
        for (const option of blank.options ?? []) checkWeights(option.weights, `${question.id}/${blank.id}`);
      }
    } else {
      errors.push(`${question.id}: unknown type "${question.type}"`);
    }

    try {
      for (const trait of questionTraits(question)) {
        if (trait in coverage) coverage[trait] += 1;
      }
    } catch {
      errors.push(`${question.id}: could not read its traits`);
    }
  }

  const expected = {
    mc: 4,
    this_or_that: 1,
    image: 1,
    map: 1,
    rank: 1,
    madlibs: 1,
    intensity: 1,
    spectrum: 1,
    agreement: 1,
  };
  for (const [type, want] of Object.entries(expected)) {
    if ((typeCount[type] ?? 0) !== want) {
      errors.push(`need ${want} "${type}" question(s), found ${typeCount[type] ?? 0}`);
    }
  }

  for (const trait of traits) {
    if ((coverage[trait] ?? 0) < 4) {
      errors.push(`trait "${trait}" appears in only ${coverage[trait] ?? 0} questions (need 4+)`);
    }
  }

  return errors;
}

/* ------------------------------------------------------------------ */
/* Cleanup + image attachment                                          */
/* ------------------------------------------------------------------ */

function cleanQuiz(quiz, slug) {
  const questions = quiz.questions.map((question) => {
    const base = { id: question.id, type: question.type, prompt: String(question.prompt).trim() };
    if (question.helper) base.helper = String(question.helper).trim();

    if (question.type === "mc" || question.type === "this_or_that" || question.type === "image") {
      base.options = question.options.map((option) => ({
        id: option.id,
        label: String(option.label).trim(),
        weights: option.weights,
        ...(option.image ? { image: option.image } : {}),
        ...(option.alt ? { alt: String(option.alt).trim() } : {}),
        ...(question.type === "image" && option.imageSearch
          ? { imageSearch: String(option.imageSearch).trim() }
          : {}),
      }));
    } else if (question.type === "intensity") {
      base.trait = question.trait;
      base.low = question.low;
      base.high = question.high;
    } else if (question.type === "spectrum") {
      base.disagree = { trait: question.disagree.trait };
      base.agree = { trait: question.agree.trait };
    } else if (question.type === "agreement") {
      base.agree = { trait: question.agree.trait, weight: Number(question.agree.weight) };
      base.disagree = { trait: question.disagree.trait, weight: Number(question.disagree.weight) };
    } else if (question.type === "map") {
      base.x = question.x;
      base.y = question.y;
      base.quadrants = question.quadrants;
    } else if (question.type === "rank") {
      base.items = question.items.map((item) => ({
        id: item.id,
        label: String(item.label).trim(),
        weights: item.weights,
      }));
    } else if (question.type === "madlibs") {
      base.template = question.template;
      base.blanks = question.blanks.map((blank) => ({
        id: blank.id,
        options: blank.options.map((option) => ({
          id: option.id,
          label: String(option.label).trim(),
          weights: option.weights,
        })),
      }));
    }
    return base;
  });

  return {
    slug,
    title: String(quiz.title).trim(),
    dek: String(quiz.dek).trim(),
    category: String(quiz.category).trim(),
    accent: quiz.accent,
    emoji: quiz.emoji,
    minutes: Math.round(Number(quiz.minutes)),
    published: today,
    tiebreaker: quiz.tiebreaker,
    questions,
    results: quiz.results.map((result) => ({
      trait: result.trait,
      name: String(result.name).trim(),
      tagline: String(result.tagline).trim(),
      blurb: String(result.blurb).trim(),
      accent: result.accent,
      mix: Object.fromEntries(
        Object.entries(result.mix).map(([trait, value]) => [trait, Math.round(Number(value))]),
      ),
      strengths: result.strengths.map((line) => String(line).trim()).slice(0, 3),
      watchOut: String(result.watchOut).trim(),
    })),
  };
}

async function attachImages(quiz, credits, usedFiles) {
  const question = quiz.questions.find((entry) => entry.type === "image");
  if (!question) throw new Error("no image question");

  const added = [];
  for (const option of question.options) {
    const result = await sourceImage({
      slug: quiz.slug,
      optionId: option.id,
      option,
      credits,
      usedFiles,
    });
    option.image = result.image;
    option.alt = result.alt;
    delete option.imageSearch;
    if (result.source === "commons" && !credits.some((entry) => entry.file === result.credit.file)) {
      credits.push(result.credit);
      added.push(result.credit);
    }
  }
  return { quiz, added };
}

async function discardImages(added, credits) {
  for (const credit of added) {
    const file = path.join(ROOT, "public", credit.file.replace(/^\//, ""));
    try {
      await unlink(file);
    } catch {
      /* already gone */
    }
    const index = credits.findIndex((entry) => entry.file === credit.file);
    if (index >= 0) credits.splice(index, 1);
  }
}

async function main() {
  await mkdir(AUTO_DIR, { recursive: true });

  if (!force && existsSync(LAST_RUN)) {
    const last = JSON.parse(await readFile(LAST_RUN, "utf8"));
    const ageHours = (Date.now() - new Date(last.at).getTime()) / 3_600_000;
    if (ageHours < GUARD_HOURS) {
      log(`guard: last run ${ageHours.toFixed(1)}h ago, skipping (use --force to override)`);
      return;
    }
  }

  const files = (await readdir(QUIZ_DIR)).filter((file) => file.endsWith(".json"));
  const existingQuizzes = await Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(path.join(QUIZ_DIR, file), "utf8")),
    ),
  );

  const existing = {
    slugs: new Set(existingQuizzes.map((quiz) => quiz.slug)),
    titles: existingQuizzes.map((quiz) => quiz.title),
    categories: [...new Set(existingQuizzes.map((quiz) => quiz.category))],
    accents: [...new Set(existingQuizzes.map((quiz) => quiz.accent))],
  };

  const usedTopics = existsSync(TOPIC_LOG)
    ? JSON.parse(await readFile(TOPIC_LOG, "utf8"))
    : [];

  log(`auto-run: count=${count} stub=${stub} existing=${existingQuizzes.length}`);

  const signal = stub ? { trends: [], buzzfeed: [] } : await research();
  log(`research: ${signal.trends.length} trends, ${signal.buzzfeed.length} headlines`);

  const ideaPrompt = buildIdeasPrompt({
    existingTitles: existing.titles,
    categories: existing.categories,
    research: researchLine(signal),
    count,
    used: usedTopics,
  });

  let ideas = [];
  try {
    const response = await callModel(ideaPrompt);
    const parsed = parseJsonLoose(response.text);
    ideas = Array.isArray(parsed) ? parsed : parsed.ideas ?? [];
    log(`ideas from ${response.provider}: ${ideas.length}`);
  } catch (error) {
    log(`idea step failed: ${error.message}`);
  }

  if (!ideas.length) {
    log("no ideas produced — aborting without publishing");
    process.exitCode = 1;
    return;
  }

  const credits = await readCredits();
  const usedFiles = new Set();
  const created = [];
  const failed = [];

  for (const idea of ideas.slice(0, count + 2)) {
    if (created.length >= count) break;

    const workingTitle = String(idea.title ?? idea.topic ?? "").trim();
    const slug = slugify(idea.slug || workingTitle);
    if (!workingTitle || existing.slugs.has(slug)) {
      log(`skip idea "${workingTitle}" (empty or duplicate slug)`);
      continue;
    }

    let previous = "";
    let errors = [];
    let quiz = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const prompt =
        attempt === 1 || !previous
          ? buildQuizPrompt({
              idea,
              existingTitles: existing.titles,
              imageCredits: credits.slice(-40).map((credit) => credit.title),
            })
          : buildRepairPrompt({ previous, errors });

      let response;
      try {
        response = await callModel(prompt);
      } catch (error) {
        log(`  ${slug}: model call failed (${error.message})`);
        errors = [error.message];
        continue;
      }

      previous = response.text;
      let parsed;
      try {
        parsed = parseJsonLoose(response.text);
      } catch (error) {
        errors = [error.message];
        log(`  ${slug}: attempt ${attempt}: ${error.message}`);
        continue;
      }

      parsed.slug = slugify(parsed.slug || workingTitle);
      errors = validateQuiz(parsed, existing, existing.accents);
      if (errors.length) {
        log(`  ${slug}: attempt ${attempt}: ${errors.length} validation error(s): ${errors[0]}`);
        continue;
      }
      quiz = parsed;
      log(`  ${slug}: valid after ${attempt} attempt(s) [${response.provider}]`);
      break;
    }

    if (!quiz) {
      failed.push({ title: workingTitle, errors: errors.slice(0, 6) });
      continue;
    }

    const cleaned = cleanQuiz(quiz, slug);
    try {
      const withImages = await attachImages(cleaned, credits, usedFiles);
      const finalErrors = validateQuiz(withImages.quiz, existing, existing.accents);
      if (finalErrors.length) {
        await discardImages(withImages.added, credits);
        failed.push({ title: workingTitle, errors: finalErrors.slice(0, 6) });
        log(`  ${slug}: post-image validation failed: ${finalErrors[0]}`);
        continue;
      }
      await writeFile(
        path.join(QUIZ_DIR, `${slug}.json`),
        `${JSON.stringify(withImages.quiz, null, 2)}\n`,
        { flag: "wx" },
      );
      existing.slugs.add(slug);
      existing.titles.push(withImages.quiz.title);
      created.push({
        slug,
        title: withImages.quiz.title,
        category: withImages.quiz.category,
        topic: idea.topic ?? workingTitle,
        images: withImages.added.length,
      });
      log(`  wrote content/quizzes/${slug}.json (${withImages.added.length} new photo(s))`);
    } catch (error) {
      failed.push({ title: workingTitle, errors: [error.message] });
      log(`  ${slug}: could not finish (${error.message})`);
    }
  }

  if (created.length) {
    await writeCredits(credits);
    await writeFile(
      TOPIC_LOG,
      `${JSON.stringify(
        [
          ...usedTopics,
          ...created.map((quiz) => ({
            topic: quiz.topic,
            slug: quiz.slug,
            at: new Date().toISOString(),
          })),
        ].slice(-400),
        null,
        2,
      )}\n`,
    );
    await writeFile(
      LAST_RUN,
      `${JSON.stringify(
        { at: new Date().toISOString(), count: created.length, created, failed },
        null,
        2,
      )}\n`,
    );
  }

  log(`\nRESULT generated=${created.length} requested=${count} failed=${failed.length}`);
  for (const quiz of created) log(`  + ${quiz.slug} — ${quiz.title}`);

  if (!created.length) process.exitCode = 1;
}

await main();
