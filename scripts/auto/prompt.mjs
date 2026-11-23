/**
 * Prompts for the automated quiz factory.
 *
 * The house rules live here in one place: 12 questions, 6 results, a fixed
 * spine of question types, no outcome leaking into the title, and the tone we
 * already use across the hand-written quizzes. `generate.mjs` enforces the
 * mechanical parts; these prompts try to get the model there first time.
 */

/** Used only if an idea ever comes back with an accent we don't have. */
export const ACCENT_FALLBACK = [
  "yellow",
  "pink",
  "sky",
  "red",
  "green",
  "purple",
  "orange",
  "blue",
];

/**
 * Rotating topic bank. The model is told these are *seeds*, not a menu: it
 * should blend one with a fresh angle, and it must never repeat a topic we
 * have already published. Roughly ordered by how much we want them.
 */
export const SEED_TOPICS = [
  "Bangladesh (Dhaka streets, rickshaws, monsoon, cha, cricket, family weddings)",
  "Demon Slayer / Kimetsu no Yaiba",
  "Squid Game",
  "Twenty-Five Twenty-One (2521)",
  "2010s internet nostalgia",
  "2020s life (group chats, doomscrolling, delivery apps)",
  "reality TV shows and the people who win them",
  "marriage and long-term partnership",
  "modern dating",
  "superpowers nobody would actually want",
  "animated movies (Pixar/DreamWorks/Ghibli vibes)",
  "Hollywood genres and movie tropes",
  "mythology (Greek, Norse, Egyptian, Bengali folklore)",
  "money habits and spending",
  "personality typologies (MBTI-adjacent, but funnier)",
  "space travel and the cosmos",
  "dinosaurs and deep time",
  "animals and the pets we become",
  "K-drama tropes (contract marriage, second lead, chaebol)",
  "anime side characters",
  "cozy video games and farming sims",
  "horror movie survival logic",
  "office and workplace archetypes",
  "cooking and the meals you'd make for someone",
  "road trips and public transport",
  "wedding guest behaviour",
  "texting styles and group chat roles",
  "birth order and family roles",
  "small-town vs big-city life",
  "the apocalypse, but domestic",
  "time travel etiquette",
  "book genres and reading habits",
  "music taste as a personality",
  "sports fandom and bandwagon behaviour",
  "board games and game-night behaviour",
  "food delivery order psychology",
  "sleep schedules and 3am thoughts",
  "the first 24 hours of a zombie outbreak",
  "supervillain origin stories",
  "historical eras you'd be bad at",
  "airport and travel-day behaviour",
  "gift-giving and receiving",
  "friend group roles",
  "school nostalgia and report cards",
  "the ideal rainy day",
  "what your browser tabs say about you",
];

const schemaBlock = `{
  "slug": "kebab-case-unique-slug",
  "title": "Title without the word quiz — max 62 characters",
  "dek": "One or two sentences of setup. Never names an outcome.",
  "category": "Short category name, e.g. Fandom, Life, Internet, Food",
  "accent": "yellow|pink|sky|red|green|purple|orange|blue",
  "emoji": "one emoji",
  "minutes": 4,
  "tiebreaker": "q12",
  "questions": [ /* exactly 12, ids q1..q12, in the order below */ ],
  "results": [ /* exactly 6 */ ]
}`;

const questionsBlock = `QUESTION ORDER — exactly these types, in this order:

q1  "mc"          4 options. Every option has 2 weights: a primary trait at 2 and a secondary at 1.
q2  "mc"          4 options, same weighting.
q3  "this_or_that" 2 options, 2 weights each.
q4  "image"       4 options. Each option needs "imageSearch" (a short 2-4 word English phrase for a REAL photograph that could illustrate it) and "alt" (a plain description of the photo). Do NOT invent image filenames.
q5  "map"         Two axes. x.low/x.high and y.low/y.high each have {label, trait}. Plus quadrants {lowLow, lowHigh, highLow, highHigh} with playful names.
q6  "rank"        4 items, each {id, label, weights}.
q7  "madlibs"     2 blanks, each with 3-4 options {id, label, weights}. The template uses {blankId} placeholders exactly matching the blank ids.
q8  "intensity"   {trait, low, high} for a 1-5 "how much is this you" statement.
q9  "spectrum"    {disagree:{trait}, agree:{trait}} for a 0-100% agreement statement.
q10 "agreement"   5-point agree/disagree, {agree:{trait,weight}, disagree:{trait,weight}}.
q11 "mc"          4 options, 2 weights each.
q12 "mc"          4 options, 2 weights each. This is the tiebreaker question, so its options must separate the six traits cleanly.

Every option/item/blank choice must carry weights (2 for its main trait, 1 for a secondary). Never use 0 weights, never invent traits.

TRAIT COVERAGE — the hard rule. Each of the 6 traits must appear in at least 4 different questions, otherwise the quiz fails validation. Plan the coverage before writing: the map alone covers 4 traits, the spectrum/agreement/intensity cover 2-3, and the four mc questions should reach every trait at least twice more. Aim for 6-8 questions per trait so no result is decided by one answer.

RESULTS — 6 of them, same traits, each:
{
  "trait": "lowercase-id-used-in-weights",
  "name": "The name shown to the player (an archetype, or a character for fandom quizzes)",
  "tagline": "One short line under the name",
  "blurb": "60-90 words, written in second person, specific to this result, no hedging",
  "accent": "one of the accent names",
  "mix": { "trait1": 45, "trait2": 11, "trait3": 11, "trait4": 11, "trait5": 11, "trait6": 11 },
  "strengths": ["three short lines", "no full stops needed", "each under 8 words"],
  "watchOut": "One sentence of honest advice, not a compliment"
}

The "mix" must contain all 6 traits and sum to exactly 100, with the result's own trait around 42-46 and the rest splitting the remainder.`;

export function buildIdeasPrompt({ existingTitles, categories, research, count, used }) {
  const unusedSeeds = SEED_TOPICS.filter(
    (seed) => !used.some((entry) => entry.seed === seed),
  );
  const available = (unusedSeeds.length >= 12 ? unusedSeeds : SEED_TOPICS)
    .slice(0, 30)
    .map((seed, index) => `${index + 1}. ${seed}`)
    .join("\n");

  return `You plan personality quizzes for QUIZZY, a site with 40+ hand-written quizzes.

We publish 3 new quizzes every 12 hours. Propose ${count + 2} quiz ideas (we pick the best ${count}).

RULES FOR IDEAS
- Each idea is an evergreen personality quiz with 6 distinct named outcomes, not a trivia quiz.
- Mix one topic from the seed bank with a fresh angle of your own. Do not simply restate a seed.
- Never repeat, and never lightly reword, a topic we already cover (list below).
- No real living people, no politicians, no news events. Fictional characters and genres are fine.
- The angle must let a person's answers actually differ: "which X are you" where X is a behaviour, a role, a vibe.
- Title: creative but instantly clear, max 62 characters. Never name an outcome in the title.
- Spread categories: don't return three ideas from the same fandom.

TOPICS WE ALREADY PUBLISHED (avoid these and close variants):
${existingTitles.join("\n")}

CATEGORIES IN USE: ${categories.join(", ")}

SEED BANK (pick from the ones we haven't used yet, then twist them):
${available}

FRESH SIGNAL — real trending searches and quiz headlines right now. Use this ONLY as background mood. Do not write about a named person, brand or news event:
${research}

Return ONLY JSON: {"ideas":[{"title":"...","topic":"3-6 word topic","category":"...","angle":"what the 6 outcomes will be","why":"why it works as a personality quiz"}]}
Keep it compact: one line, no indentation, no code fences.`;
}

export function buildQuizPrompt({ idea, existingTitles, imageCredits }) {
  return `Write one complete QUIZZY personality quiz as JSON.

TOPIC: ${idea.topic}
WORKING TITLE: ${idea.title?.trim() || "(none yet — invent one, max 62 characters, never naming an outcome)"}
CATEGORY: ${idea.category}
ANGLE: ${idea.angle}

HOUSE RULES
- 12 questions, 6 results. Title max 62 characters. dek max 190 characters.
- The title and dek must NOT reveal, hint at, or list any of the 6 outcomes. The player finds out only after submitting.
- Tone: dry, specific, funny, a little warm. Concrete details beat adjectives.
- Banned: "In this quiz", "Let's find out", "Are you ready", "unleash", "journey", "vibes", "literally", emoji inside text, exclamation marks in prompts.
- Prompts are short (under 90 characters). Options are parallel in length and tone.
- Never mention real living people or current news.
- Do not reuse titles from the site: ${existingTitles.join(" | ")}

${schemaBlock}

${questionsBlock}

House style reference for phrasing (do not copy it, match the register): prompts like "An ordinary Tuesday goes wrong. You:", "The comfort you'd choose:", "Someone tells you no. You:". Options are specific physical or social choices, not adjectives.

Write fresh material for this topic. Return ONLY the JSON object, no prose, no code fences. Use compact JSON: one line on the wire if you can, no indentation, no trailing commentary.`;
}

export function buildRepairPrompt({ previous, errors }) {
  const trimmed = previous.length > 8000 ? `${previous.slice(0, 4500)}\n…\n${previous.slice(-3500)}` : previous;
  return `Your previous quiz JSON failed validation with these errors:

${errors.map((error) => `- ${error}`).join("\n")}

Here is the JSON you produced:

${trimmed}

Fix every listed error and return the complete corrected JSON object only. Keep the parts that already passed. Do not change the topic or the slug unless the error says to.`;
}
