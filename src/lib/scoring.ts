/* ------------------------------------------------------------------
   QUIZZY — quiz types + scoring engine.

   Every answer contributes "earned" points to one or more traits. Each
   question also declares how many points a trait *could* have earned, so
   the final score is normalised as earned / max. That keeps quizzes with
   different question weights comparable.
------------------------------------------------------------------ */

export type WeightMap = Record<string, number>;

export type QuestionType =
  | "mc"
  | "this_or_that"
  | "image"
  | "intensity"
  | "spectrum"
  | "agreement"
  | "map"
  | "rank"
  | "madlibs";

export interface Option {
  id: string;
  label: string;
  weights: WeightMap;
  /** Only used by `image` questions: a path under /public. */
  image?: string;
  alt?: string;
}

interface BaseQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  helper?: string;
}

/** `mc`, `this_or_that` and `image` are all single-choice; only the layout differs. */
export interface ChoiceQuestion extends BaseQuestion {
  type: "mc" | "this_or_that" | "image";
  options: Option[];
}

/** A 1–5 "how much is this you" slider that feeds a single trait. */
export interface IntensityQuestion extends BaseQuestion {
  type: "intensity";
  trait: string;
  low: string;
  high: string;
}

/**
 * A statement rated 0–100% agreement. 0% is "strongly disagree" and feeds the
 * `disagree` trait, 100% is "strongly agree" and feeds the `agree` trait.
 */
export interface SpectrumQuestion extends BaseQuestion {
  type: "spectrum";
  disagree: { trait: string };
  agree: { trait: string };
}

/** A 5-point agree/disagree scale that pushes two different traits. */
export interface AgreementQuestion extends BaseQuestion {
  type: "agreement";
  agree: { trait: string; weight: number };
  disagree: { trait: string; weight: number };
}

/** One pole of a two-axis map: what the axis is called, and the trait it feeds. */
export interface MapAxis {
  label: string;
  trait: string;
}

/**
 * A single dot dragged around a square. Each axis scores like a spectrum, so
 * one question feeds four traits: two per axis. `x` 0 = low (left), `y` 0 = low
 * (bottom); 100 = high (right / top).
 */
export interface MapQuestion extends BaseQuestion {
  type: "map";
  x: { low: MapAxis; high: MapAxis };
  y: { low: MapAxis; high: MapAxis };
  /** Fun names for the four corners, shown while dragging. */
  quadrants: {
    lowLow: string;
    lowHigh: string;
    highLow: string;
    highHigh: string;
  };
}

export interface RankItem {
  id: string;
  label: string;
  weights: WeightMap;
}

/** Four (or so) items dragged into order; 1st place scores full weight. */
export interface RankQuestion extends BaseQuestion {
  type: "rank";
  items: RankItem[];
}

/** A fill-in-the-blank option. Kept separate from `Option` — no images here. */
export interface MadlibOption {
  id: string;
  label: string;
  weights: WeightMap;
}

export interface MadlibBlank {
  id: string;
  options: MadlibOption[];
}

/** A sentence with inline gaps; each gap scores like a tiny multiple choice. */
export interface MadlibsQuestion extends BaseQuestion {
  type: "madlibs";
  /** Placeholders use {blankId}, e.g. "I'm the kind of person who {a} when {b}." */
  template: string;
  blanks: MadlibBlank[];
}

export type Question =
  | ChoiceQuestion
  | IntensityQuestion
  | SpectrumQuestion
  | AgreementQuestion
  | MapQuestion
  | RankQuestion
  | MadlibsQuestion;

export interface QuizResult {
  trait: string;
  name: string;
  tagline: string;
  blurb: string;
  accent: string;
  /** Signature distribution, always sums to 100. Used by the results chart. */
  mix: WeightMap;
  strengths: string[];
  watchOut: string;
}

export interface Quiz {
  slug: string;
  title: string;
  dek: string;
  category: string;
  accent: string;
  emoji: string;
  minutes: number;
  featured?: boolean;
  trending?: boolean;
  published?: string;
  tiebreaker?: string;
  questions: Question[];
  results: QuizResult[];
}

/**
 * The part of a quiz the player and the scoring engine need. Deliberately
 * excludes result names, taglines and blurbs so the take page never ships
 * the possible outcomes to the browser.
 */
export interface PlayableQuiz extends Omit<Quiz, "results"> {
  results: Pick<QuizResult, "trait">[];
}

export interface PointAnswer {
  x: number;
  y: number;
}

export type AnswerValue =
  | string
  | number
  | string[]
  | PointAnswer
  | Record<string, string>;
export type Answers = Record<string, AnswerValue>;

/** Position weights for `rank`: 1st, 2nd, 3rd, 4th… */
export const RANK_WEIGHTS = [1, 0.6, 0.3, 0];

export interface TraitScore {
  trait: string;
  earned: number;
  max: number;
  /** 0–100, rounded. */
  pct: number;
}

export interface ScoreReport {
  scores: TraitScore[];
  winner: string;
  /** Distribution across traits, normalised to sum to 100. */
  shares: WeightMap;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function questionTraits(question: Question): string[] {
  switch (question.type) {
    case "mc":
    case "this_or_that":
    case "image":
      return [
        ...new Set(question.options.flatMap((option) => Object.keys(option.weights))),
      ];
    case "intensity":
      return [question.trait];
    case "spectrum":
      return [...new Set([question.disagree.trait, question.agree.trait])];
    case "agreement":
      return [...new Set([question.agree.trait, question.disagree.trait])];
    case "map":
      return [
        ...new Set([
          question.x.low.trait,
          question.x.high.trait,
          question.y.low.trait,
          question.y.high.trait,
        ]),
      ];
    case "rank":
      return [
        ...new Set(
          question.items.flatMap((item) => Object.keys(item.weights)),
        ),
      ];
    case "madlibs":
      return [
        ...new Set(
          question.blanks.flatMap((blank) =>
            blank.options.flatMap((option) => Object.keys(option.weights)),
          ),
        ),
      ];
  }
}

export function quizTraits(quiz: PlayableQuiz): string[] {
  return quiz.results.map((result) => result.trait);
}

/**
 * How far through the quiz an answer set is, 0–1.
 * Used for the progress bar and the "next unanswered" jump.
 */
export function completion(quiz: PlayableQuiz, answers: Answers): number {
  if (!quiz.questions.length) return 0;
  const answered = quiz.questions.filter(
    (question) => answers[question.id] !== undefined,
  ).length;
  return answered / quiz.questions.length;
}

/** Score every answer, then normalise and rank the traits. */
export function scoreQuiz(quiz: PlayableQuiz, answers: Answers): ScoreReport {
  const traits = quizTraits(quiz);
  const earned: WeightMap = {};
  const max: WeightMap = {};

  for (const trait of traits) {
    earned[trait] = 0;
    max[trait] = 0;
  }

  const addEarned = (trait: string, value: number) => {
    earned[trait] = (earned[trait] ?? 0) + value;
  };
  const addMax = (trait: string, value: number) => {
    max[trait] = (max[trait] ?? 0) + value;
  };

  for (const question of quiz.questions) {
    const answer = answers[question.id];

    if (
      question.type === "mc" ||
      question.type === "this_or_that" ||
      question.type === "image"
    ) {
      // The most a trait could have earned here is its best single option.
      const ceiling: WeightMap = {};
      for (const option of question.options) {
        for (const [trait, weight] of Object.entries(option.weights)) {
          ceiling[trait] = Math.max(ceiling[trait] ?? 0, weight);
        }
      }
      for (const [trait, weight] of Object.entries(ceiling)) addMax(trait, weight);

      if (typeof answer !== "string") continue;
      const chosen = question.options.find((option) => option.id === answer);
      if (!chosen) continue;
      for (const [trait, weight] of Object.entries(chosen.weights)) {
        addEarned(trait, weight);
      }
      continue;
    }

    if (question.type === "intensity") {
      addMax(question.trait, 5);
      if (typeof answer !== "number") continue;
      addEarned(question.trait, clamp(answer, 1, 5));
      continue;
    }

    if (question.type === "spectrum") {
      addMax(question.disagree.trait, 2);
      addMax(question.agree.trait, 2);
      if (typeof answer !== "number") continue;
      const position = clamp(answer, 0, 100);
      // 0% agreement → 2 points to the disagree trait, 100% → the agree trait.
      addEarned(question.disagree.trait, (100 - position) / 50);
      addEarned(question.agree.trait, position / 50);
      continue;
    }

    if (question.type === "map") {
      addMax(question.x.low.trait, 2);
      addMax(question.x.high.trait, 2);
      addMax(question.y.low.trait, 2);
      addMax(question.y.high.trait, 2);
      if (
        typeof answer !== "object" ||
        answer === null ||
        Array.isArray(answer) ||
        !("x" in answer) ||
        !("y" in answer)
      ) {
        continue;
      }
      const pointX = clamp(Number(answer.x), 0, 100);
      const pointY = clamp(Number(answer.y), 0, 100);
      // Each axis behaves like a spectrum: its two poles split 4 points.
      addEarned(question.x.low.trait, (100 - pointX) / 50);
      addEarned(question.x.high.trait, pointX / 50);
      addEarned(question.y.low.trait, (100 - pointY) / 50);
      addEarned(question.y.high.trait, pointY / 50);
      continue;
    }

    if (question.type === "rank") {
      // Ceiling is the best single item, because 1st place = that item at full weight.
      const ceiling: WeightMap = {};
      for (const item of question.items) {
        for (const [trait, weight] of Object.entries(item.weights)) {
          ceiling[trait] = Math.max(ceiling[trait] ?? 0, weight);
        }
      }
      for (const [trait, weight] of Object.entries(ceiling)) addMax(trait, weight);
      if (!Array.isArray(answer)) continue;
      answer.forEach((itemId, position) => {
        if (typeof itemId !== "string") return;
        const item = question.items.find((entry) => entry.id === itemId);
        if (!item) return;
        const factor = RANK_WEIGHTS[position] ?? 0;
        for (const [trait, weight] of Object.entries(item.weights)) {
          addEarned(trait, weight * factor);
        }
      });
      continue;
    }

    if (question.type === "madlibs") {
      // Each blank contributes its own ceiling, so no blank dominates.
      for (const blank of question.blanks) {
        const best: WeightMap = {};
        for (const option of blank.options) {
          for (const [trait, weight] of Object.entries(option.weights)) {
            best[trait] = Math.max(best[trait] ?? 0, weight);
          }
        }
        for (const [trait, weight] of Object.entries(best)) addMax(trait, weight);
      }
      if (
        typeof answer !== "object" ||
        answer === null ||
        Array.isArray(answer) ||
        "x" in answer
      ) {
        continue;
      }
      for (const blank of question.blanks) {
        const picked = answer[blank.id];
        const chosen = blank.options.find((option) => option.id === picked);
        if (!chosen) continue;
        for (const [trait, weight] of Object.entries(chosen.weights)) {
          addEarned(trait, weight);
        }
      }
      continue;
    }

    // agreement: 0 = hard no, 2 = neutral, 4 = hard yes
    if (question.type !== "agreement") continue;
    addMax(question.agree.trait, question.agree.weight);
    addMax(question.disagree.trait, question.disagree.weight);
    if (typeof answer !== "number") continue;
    const level = clamp(answer, 0, 4);
    if (level >= 2) {
      addEarned(question.agree.trait, (question.agree.weight * (level - 2)) / 2);
    } else {
      addEarned(
        question.disagree.trait,
        (question.disagree.weight * (2 - level)) / 2,
      );
    }
  }

  const scores: TraitScore[] = traits.map((trait) => {
    const possible = max[trait] ?? 0;
    const got = earned[trait] ?? 0;
    return {
      trait,
      earned: Math.round(got * 100) / 100,
      max: possible,
      pct: possible > 0 ? Math.round((got / possible) * 100) : 0,
    };
  });

  const order = new Map(traits.map((trait, index) => [trait, index]));
  const ranked = [...scores].sort(
    (a, b) =>
      b.pct - a.pct ||
      b.earned - a.earned ||
      (order.get(a.trait) ?? 0) - (order.get(b.trait) ?? 0),
  );

  let winner = ranked[0]?.trait ?? traits[0];

  // Tie-break: first on raw earned (already applied), then on the question
  // flagged as the tiebreaker in the quiz JSON.
  const tied = ranked.filter(
    (score) => score.pct === ranked[0]?.pct && score.earned === ranked[0]?.earned,
  );

  if (tied.length > 1 && quiz.tiebreaker) {
    const question = quiz.questions.find((q) => q.id === quiz.tiebreaker);
    const answer = answers[quiz.tiebreaker];
    if (
      question &&
      (question.type === "mc" ||
        question.type === "this_or_that" ||
        question.type === "image") &&
      typeof answer === "string"
    ) {
      const option = question.options.find((o) => o.id === answer);
      if (option) {
        let best = -1;
        for (const candidate of tied) {
          const weight = option.weights[candidate.trait] ?? 0;
          if (weight > best) {
            best = weight;
            winner = candidate.trait;
          }
        }
      }
    }
  }

  // Chart shares: proportional to percentages, and forced to sum to exactly
  // 100 using largest-remainder rounding (plain rounding drifts to 99/101).
  const totalPct = scores.reduce((sum, score) => sum + score.pct, 0);
  const exact = scores.map((score) =>
    totalPct > 0 ? (score.pct / totalPct) * 100 : 100 / scores.length,
  );
  const units = exact.map((value) => Math.floor(value));
  const leftover = 100 - units.reduce((sum, value) => sum + value, 0);
  const remainders = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < leftover && remainders.length; i += 1) {
    units[remainders[i % remainders.length].index] += 1;
  }

  const shares: WeightMap = {};
  scores.forEach((score, index) => {
    shares[score.trait] = units[index];
  });

  return { scores, winner, shares };
}
