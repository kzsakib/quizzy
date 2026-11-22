// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages serves this project from https://kzsakib.github.io/quizzy/,
// so the deploy build needs `site` + `base` set. Local dev keeps the root so
// the preview works at http://localhost:3000/.
const env = /** @type {Record<string, string | undefined>} */ (
  /** @type {any} */ (globalThis).process?.env ?? {}
);
const onPages = env.GITHUB_PAGES === "true";

// https://astro.build/config
export default defineConfig({
  site: onPages ? "https://kzsakib.github.io" : "https://quizzy.pages.dev",
  base: onPages ? "/quizzy" : "/",
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
