/** Sanity checks for quiz content: reachable results, sums, images, alts. */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { scoreQuiz, questionTraits } from "../src/lib/scoring.ts";

const dir = "content/quizzes";
const files = readdirSync(dir).filter((file) => file.endsWith(".json"));
let failures = 0;

const fail = (message) => {
  console.error(`FAIL ${message}`);
  failures += 1;
};

const shuffle = (list) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];

for (const file of files) {
  const quiz = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
  const traits = quiz.results.map((result) => result.trait);

  // Titles are a single clean question. Cast restrictions ("side characters
  // only") and other caveats belong in the dek, not in brackets after the title.
  if (/[()]/.test(quiz.title)) {
    fail(`${quiz.slug}: title has a parenthetical — move it to the dek`);
  }

  if (quiz.questions.length < 10 || quiz.questions.length > 20) {
    fail(`${quiz.slug}: ${quiz.questions.length} questions (want 10–20)`);
  }

  // 7–10 results is the house rule, spread evenly across quizzes. A quiz
  // whose cast is fixed (four Hogwarts houses) cannot reach that range without
  // inventing houses, so it may keep its four.
  const fixedCast = new Set(["hogwarts-house"]);
  const floor = fixedCast.has(quiz.slug) ? 4 : 7;
  if (traits.length < floor || traits.length > 10) {
    fail(`${quiz.slug}: ${traits.length} results (want ${floor}–10)`);
  }

  // The four-option pick is the spine of every quiz; everything else is optional.
  if (!quiz.questions.some((question) => question.type === "mc")) {
    fail(`${quiz.slug}: no mc question`);
  }

  const known = (trait, where) => {
    if (!traits.includes(trait)) fail(`${quiz.slug}/${where}: unknown trait ${trait}`);
  };

  // Choice options and mad-lib chips need a unique id: the player compares the
  // stored answer against option.id, so a missing id makes every option look
  // selected and the question impossible to answer.
  const checkIds = (options, where) => {
    const ids = options.map((option) => option.id);
    if (ids.some((id) => typeof id !== "string" || !id)) {
      fail(`${quiz.slug}/${where}: option without an id`);
    }
    if (new Set(ids).size !== ids.length) {
      fail(`${quiz.slug}/${where}: duplicate option ids`);
    }
  };

  const seenTraits = new Set();
  for (const question of quiz.questions) {
    if (
      question.type === "mc" ||
      question.type === "this_or_that" ||
      question.type === "image"
    ) {
      checkIds(question.options, question.id);
    }

    if (question.type === "image") {
      for (const option of question.options) {
        if (!option.image) fail(`${quiz.slug}/${question.id}: no image`);
        else if (!existsSync(path.join("public", option.image))) {
          fail(`${quiz.slug}/${question.id}: missing ${option.image}`);
        }
        if (!option.alt) fail(`${quiz.slug}/${question.id}: no alt text`);
      }
    }

    if (question.type === "map") {
      for (const axis of [question.x, question.y]) {
        for (const pole of [axis.low, axis.high]) {
          known(pole.trait, question.id);
          if (!pole.label) fail(`${quiz.slug}/${question.id}: axis pole without a label`);
        }
      }
      for (const corner of ["lowLow", "lowHigh", "highLow", "highHigh"]) {
        if (!question.quadrants?.[corner]) {
          fail(`${quiz.slug}/${question.id}: quadrant ${corner} has no name`);
        }
      }
    }

    if (question.type === "rank") {
      if (question.items.length < 3 || question.items.length > 6) {
        fail(`${quiz.slug}/${question.id}: ${question.items.length} items (want 3–6)`);
      }
      for (const item of question.items) {
        for (const trait of Object.keys(item.weights)) known(trait, question.id);
      }
    }

    if (question.type === "madlibs") {
      const gaps = [...question.template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const ids = question.blanks.map((blank) => blank.id);
      if (gaps.join(",") !== ids.join(",")) {
        fail(`${quiz.slug}/${question.id}: template gaps ${gaps.join("/")} ≠ blanks ${ids.join("/")}`);
      }
      for (const blank of question.blanks) {
        checkIds(blank.options, `${question.id}/${blank.id}`);
        if (blank.options.length < 2) {
          fail(`${quiz.slug}/${question.id}/${blank.id}: fewer than 2 options`);
        }
        for (const option of blank.options) {
          for (const trait of Object.keys(option.weights)) known(trait, question.id);
        }
      }
    }

    for (const trait of questionTraits(question)) seenTraits.add(trait);
  }

  for (const trait of traits) {
    if (!seenTraits.has(trait)) fail(`${quiz.slug}: ${trait} never scored`);
  }

  // Guide rule: every result must be reached by at least four questions,
  // otherwise its score is decided by one or two answers alone.
  const coverage = Object.fromEntries(traits.map((trait) => [trait, 0]));
  for (const question of quiz.questions) {
    for (const trait of questionTraits(question)) {
      coverage[trait] = (coverage[trait] ?? 0) + 1;
    }
  }
  for (const [trait, count] of Object.entries(coverage)) {
    if (count < 4) fail(`${quiz.slug}: ${trait} appears in only ${count} questions`);
  }

  // Sample playthroughs and make sure every result can actually come up.
  const winners = new Set();
  for (let run = 0; run < 400; run += 1) {
    const answers = {};
    for (const question of quiz.questions) {
      if (question.type === "map") {
        answers[question.id] = {
          x: Math.floor(Math.random() * 101),
          y: Math.floor(Math.random() * 101),
        };
      } else if (question.type === "rank") {
        answers[question.id] = shuffle(question.items.map((item) => item.id));
      } else if (question.type === "madlibs") {
        answers[question.id] = Object.fromEntries(
          question.blanks.map((blank) => [blank.id, pick(blank.options).id]),
        );
      } else if (question.options) {
        answers[question.id] = pick(question.options).id;
      } else if (question.type === "intensity") {
        answers[question.id] = 1 + Math.floor(Math.random() * 5);
      } else if (question.type === "spectrum") {
        answers[question.id] = Math.floor(Math.random() * 101);
      } else {
        answers[question.id] = Math.floor(Math.random() * 5);
      }
    }
    const report = scoreQuiz(quiz, answers);
    winners.add(report.winner);
    const sum = Object.values(report.shares).reduce((total, value) => total + value, 0);
    if (sum !== 100) fail(`${quiz.slug}: shares sum to ${sum}`);
  }
  for (const trait of traits) {
    if (!winners.has(trait)) fail(`${quiz.slug}: ${trait} never wins in samples`);
  }

  console.log(
    `ok ${quiz.slug.padEnd(20)} ${quiz.questions.length}q  ${traits.length} results  all reachable`,
  );
}

console.log(failures ? `\n${failures} failure(s)` : "\nALL CHECKS PASSED");
process.exitCode = failures ? 1 : 0;
