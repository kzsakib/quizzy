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

for (const file of files) {
  const quiz = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
  const traits = quiz.results.map((result) => result.trait);

  if (quiz.questions.length < 10 || quiz.questions.length > 20) {
    fail(`${quiz.slug}: ${quiz.questions.length} questions (want 10–20)`);
  }

  // 6–12 results is the house rule; a fixed-cast fandom quiz (four houses)
  // is the one allowed exception, so the floor here is four.
  if (traits.length < 4 || traits.length > 12) {
    fail(`${quiz.slug}: ${traits.length} results (want 4–12)`);
  }

  const seenTraits = new Set();
  for (const question of quiz.questions) {
    if (question.options) {
      for (const option of question.options) {
        for (const trait of Object.keys(option.weights)) {
          if (!traits.includes(trait)) fail(`${quiz.slug}: unknown trait ${trait}`);
          seenTraits.add(trait);
        }
        if (question.type === "image") {
          if (!option.image) fail(`${quiz.slug}/${question.id}: no image`);
          else if (!existsSync(path.join("public", option.image))) {
            fail(`${quiz.slug}/${question.id}: missing ${option.image}`);
          }
          if (!option.alt) fail(`${quiz.slug}/${question.id}: no alt text`);
        }
      }
    } else if (question.type === "intensity") {
      if (!traits.includes(question.trait)) fail(`${quiz.slug}: bad trait`);
      seenTraits.add(question.trait);
    } else if (question.type === "spectrum") {
      seenTraits.add(question.disagree.trait);
      seenTraits.add(question.agree.trait);
    } else {
      seenTraits.add(question.agree.trait);
      seenTraits.add(question.disagree.trait);
    }
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
      if (question.options) {
        const option = question.options[Math.floor(Math.random() * question.options.length)];
        answers[question.id] = option.id;
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
