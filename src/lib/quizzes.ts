import type { Quiz } from "./scoring";

/* Every quiz lives as plain JSON in /content/quizzes so it can be edited
   without touching a component. Vite inlines them at build time. */
const modules = import.meta.glob<{ default: Quiz }>("/content/quizzes/*.json", {
  eager: true,
});

const byDate = (a: Quiz, b: Quiz) =>
  (b.published ?? "").localeCompare(a.published ?? "");

export const quizzes: Quiz[] = Object.values(modules)
  .map((module) => module.default)
  .sort(byDate);

export const trendingQuizzes: Quiz[] = quizzes.filter((quiz) => quiz.trending);
export const featuredQuiz: Quiz | undefined =
  quizzes.find((quiz) => quiz.featured) ?? quizzes[0];

export interface Category {
  name: string;
  slug: string;
  accent: string;
  emoji: string;
  count: number;
  quizzes: Quiz[];
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const categories: Category[] = Object.values(
  quizzes.reduce<Record<string, Category>>((groups, quiz) => {
    const slug = slugify(quiz.category);
    groups[slug] ??= {
      name: quiz.category,
      slug,
      accent: quiz.accent,
      emoji: quiz.emoji,
      count: 0,
      quizzes: [],
    };
    groups[slug].count += 1;
    groups[slug].quizzes.push(quiz);
    return groups;
  }, {}),
);

export function getQuiz(slug: string): Quiz | undefined {
  return quizzes.find((quiz) => quiz.slug === slug);
}

export function getCategory(slug: string): Category | undefined {
  return categories.find((category) => category.slug === slug);
}

/** All quizzes except the one being viewed, newest first. */
export function relatedQuizzes(slug: string, limit = 3): Quiz[] {
  return quizzes.filter((quiz) => quiz.slug !== slug).slice(0, limit);
}
