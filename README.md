# Quizzy

A bold, dark-mode-first personality quiz site. Astro + React islands + TypeScript,
Tailwind CSS v4 with CSS-variable design tokens, GSAP and Lenis.

## Commands

| Command           | Does                                        |
| ----------------- | ------------------------------------------- |
| `npm install`     | Install dependencies                        |
| `npm run dev`     | Start the dev server on `0.0.0.0:4321`      |
| `npm run build`   | Build the production site to `dist/`        |
| `npm run preview` | Preview the production build                |
| `npm run check`   | Astro + TypeScript diagnostics              |
| `node scripts/check-quizzes.mjs` | Validate question counts, images, reachable results |
| `node scripts/fetch-question-images.mjs` | Re-download picture-question photos |
| `node scripts/optimize-question-images.mjs` | Resize quiz photos to 800px wide and recompress |

## Status

Phase 2 of 6 — home page plus a playable quiz engine, polished.

- [x] Astro / React / TypeScript / Tailwind v4 setup
- [x] Design tokens in `src/styles/tokens.css` (dark + paper mode)
- [x] Self-hosted fonts via `@fontsource`
- [x] Lenis + GSAP ticker sync, ScrollTrigger / SplitText / Flip registered
- [x] Base layout, floating nav pill, oversized footer wordmark
- [x] Home page: marquee hero, category bento, trending bento, fresh scroller
- [x] Quiz engine, scoring and result pages — 31 quizzes across sitcoms, fandom,
      love, personality, music, anime, pop culture, sports, horror, folklore,
      gaming, food, K-drama, sci-fi, books, crime, fantasy and villainy
- [x] Single-page player: every question on one scrolling page, answers autosaved
  and editable until you submit
- [x] Nine question types, including picture choices, a two-axis map, drag-to-rank and mad libs
- [x] Per-quiz accent: a page wears the colour of its card (`data-accent`)
- [x] Results revealed only after the last answer — no outcome lists up front
- [x] 4–12 possible results per quiz, each with its own signature mix
- [x] Smooth 0–100% agreement sliders with no snap points
- [x] Donut-only result chart, legend aligned beside it
- [x] Result name, tagline and blurb typed out on arrival
- [x] Inverting blob cursor that follows with lag, morphs and drips on click
- [x] Muted text tokens checked for WCAG AA contrast in both themes
- [ ] Results polish, share images, remaining accessibility audit, deployment

## Structure

```
src/
  components/        Nav, Footer, QuizCard, React islands (ThemeToggle,
                     QuizPlayer, QzSlider, ResultChart)
  layouts/           BaseLayout.astro
  lib/               motion.ts (Lenis + GSAP), quizzes.ts, scoring.ts
  pages/             index.astro, list, category/[slug], quiz/[slug]/{index,take,result/[trait]}
  styles/            tokens.css, global.css
content/quizzes/     one JSON file per quiz
public/images/       quiz covers and result art
scripts/             picture-question photo refresh + content migrations
```

## Design tokens

All colours, radii, type families and layout values are raw CSS custom
properties in `src/styles/tokens.css`, re-exported to Tailwind through
`@theme inline` in `src/styles/global.css`. Use utilities such as
`bg-surface`, `text-ink`, `border-line`, `rounded-tile`, `font-display`,
`font-serif`, or the accent colours (`bg-yellow`, `bg-purple`, …).

`[data-theme="paper"]` flips the semantic surfaces to cream; the theme toggle
persists the choice in `localStorage` under `qz-theme`.

## Quiz schema

One JSON file per quiz in `content/quizzes/`. The file name should match the
`slug`. A quiz takes **10–20 questions** and normally **6–12 results** (a
fandom quiz with a fixed cast, such as Hogwarts houses, can use 4). Every trait
used by a question must exist in `results`, must appear in at least four
questions, and every result must be reachable.

Question copy follows the writing guide (flavour mix, real behaviour in every
option, no obviously correct answer). Editorial self-reviews and flavour tallies
for each quiz live in `content/quizzes/self-review.md`.

```json
{
  "slug": "love-language",
  "title": "Your actual love language",
  "dek": "One sentence shown on cards and the intro page.",
  "category": "Love",
  "accent": "pink",
  "emoji": "💌",
  "minutes": 3,
  "featured": true,
  "trending": false,
  "published": "2026-11-20",
  "tiebreaker": "q6",
  "questions": [],
  "results": []
}
```

`accent` is one of `yellow`, `purple`, `red`, `sky`, `lime`, `pink`, `green`,
`cyan`, `blue`, `orange` and maps to `--accent-<name>`.

### Question types

| `type`         | Shape                                                                 |
| -------------- | --------------------------------------------------------------------- |
| `mc`           | `options[]`, each `{ id, label, weights: { trait: points } }`          |
| `this_or_that` | Same as `mc`, rendered as two large side-by-side choices               |
| `image`        | Same as `mc`, plus `image` (a `/public` path) and optional `alt`       |
| `intensity`    | `trait`, `low`, `high` — a 1–5 slider worth 1–5 points for that trait  |
| `spectrum`     | `disagree { trait }`, `agree { trait }` — a statement rated 0–100% agreement |
| `agreement`    | `agree { trait, weight }`, `disagree { trait, weight }` — 5-point scale |
| `map`          | `x { low, high }`, `y { low, high }` poles (`label`, `trait`) and four `quadrants` names — a dragged dot, two spectrums at once |
| `rank`         | `items[]`, each `{ id, label, weights }` — drag (or arrow-key) four items into order; 1st = full weight, then 60%, 30%, 0 |
| `madlibs`      | `template` with `{a}`/`{b}` gaps plus `blanks[]` (`id`, `options[]` with `label`/`weights`) — a sentence filled in from phrase chips |

Picture options look like this:

```json
{
  "id": "a",
  "label": "Painted bright, slightly too loud",
  "image": "/images/questions/friends-door-yellow.jpg",
  "alt": "A yellow front door in a grey wall",
  "weights": { "rachel": 2, "monica": 1 }
}
```

Quiz photos live in `public/images/questions/` and are real, openly licensed
photographs from Wikimedia Commons and Openverse, not stills, logos or official
material. They are resized to 800px wide and recompressed with
`node scripts/optimize-question-images.mjs`, so the whole set stays a few MB. `public/images/questions/credits.json` records the
creator, licence and source page for every file; `scripts/fetch-question-images.mjs`
re-downloads them from those recorded sources.

### Scoring

`src/lib/scoring.ts` accumulates `earned` and `max` per trait, where `max` is
the most that trait could have earned across the whole quiz (the best single
option for choice questions, 5 for intensity, 2 per spectrum pole, the declared
weight for agreement, 2 per map pole, the best single item for rank, and the
best option in each blank for mad libs).

The final percentage is `earned / max`; the highest percentage wins. Ties are
broken by raw earned points first, then by the answer to the question whose id
is listed in `tiebreaker`. Results are shared as
`/quiz/<slug>/result/<trait>/`, and the player stores the real breakdown in
`sessionStorage` under `qz:report:<slug>` so the result chart can show it.
Chart shares are normalised to sum to exactly 100 using largest-remainder
rounding.

### Results

Each result row needs `trait`, `name`, `tagline`, `blurb`, `accent`,
`strengths[]`, `watchOut` and `mix` — a signature distribution that sums to
100 and is used as the chart fallback when someone opens a result link cold.

## Player

The take page is a single scrolling page: every question is on it, in order,
with a sticky progress bar that jumps to the next unanswered one. Answers are
saved to `sessionStorage` (`qz:answers:<slug>`) and can be changed until you
submit, so no outcome is shown before the last answer.

`QzMap.tsx` is one dot dragged around a labelled square (arrow keys nudge it),
with the four corner names lighting up as you move; both axes score like a
spectrum. `QzRank.tsx` reorders four items by pointer drag or the arrow
buttons, and first place counts full weight. `QzMadlibs.tsx` turns the question
text into a sentence with tappable gaps that open phrase chips.

Sliders (`QzSlider.tsx`) are native range inputs with an invisible thumb on
top of a custom track. Dragging, touch and arrow keys stay native; the visible
fill sits exactly under the thumb with no easing and no snap points, so the
control moves continuously, and the thumb scales while in use.

`spectrum` questions are statements rather than two labelled poles: the slider
runs 0–100% from “strongly disagree” to “strongly agree”, shows the live
percentage above the track, and feeds the `disagree` trait at the low end and
the `agree` trait at the high end.

## Colour

Each quiz card has an `accent` name from `tokens.css`. Quiz pages pass it to
`BaseLayout`, which sets `data-accent` on `<html>`; the matching
`[data-accent="…"]` rule then points `--accent` at that colour for the whole
page — progress bar, selected options, sliders, focus rings and selection.
Result pages use the winning result's own accent.

`--accent-text` mixes the accent towards the current ink so accent-coloured
labels stay legible in both themes, and `--on-accent` picks near-black or white
text for content sitting on an accent fill (deep violet needs white). Muted
text uses the fixed `--ink-muted` / `--ink-soft` / `--ink-strong` tokens rather
than opacity, which keeps small labels above 4.5:1 on dark and on cream.

## Motion

`src/lib/motion.ts` owns a single Lenis instance synced to the GSAP ticker and
exposes `initMotion()`, `revealOnScroll()`, `scrollToTarget()`, `stopScroll()`
and `startScroll()`. Motion is always on: everything marked with `data-reveal`
animates automatically on load (and as it enters the viewport). Lenis 1.3 ships
with `respectReducedMotion: true`, which silently disables smoothing for anyone
whose OS asks for reduced motion; that option is explicitly set to `false` here
so the scroll feel is identical for every visitor. Add `data-lenis-prevent` to
any horizontal scroller inside the page.

`BlobCursor.tsx` is a desktop-only React island mounted in `BaseLayout`. It is
a white, radial-gradient blob painted with `mix-blend-mode: difference`, so the
page behind it is genuinely inverted; the shape wobbles with pointer speed and
click splashes fall under gravity. `Typewriter.astro` server-renders the full
text and re-types it with an inline script, so results still read correctly
without JavaScript.

## Deployment

The site is published to GitHub Pages at
<https://kzsakib.github.io/quizzy/> by `.github/workflows/deploy.yml` on every
push to `main`.

GitHub Pages serves project sites from a subpath, so the workflow sets
`GITHUB_PAGES=true`, which makes `astro.config.mjs` use `base: "/quizzy"`.
Every internal link goes through `siteHref()` in `src/lib/url.ts` (wrapping
`import.meta.env.BASE_URL`), so the same build works at the root locally and
under `/quizzy/` when deployed. Canonical and Open Graph URLs use `Astro.site`.
