/**
 * LLM adapters. Gemini first (free tier), Groq as the fallback, and a stub
 * used only by local `--stub` runs to exercise the pipeline without a key.
 */

const TIMEOUT_MS = 180_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function postJson(url, body, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`${url.split("/")[2]} ${response.status}: ${text.slice(0, 300)}`);
      error.status = response.status;
      throw error;
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function geminiText(payload) {
  const candidate = payload?.candidates?.[0];
  const block = candidate?.finishReason;
  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text) {
    throw new Error(`empty Gemini response${block ? ` (${block})` : ""}`);
  }
  return text;
}

// Free-tier quota is per model, so one exhausted model does not mean the key
// is useless. If every model reports 429 in the same run, stop trying Gemini
// until the next run — no point burning minutes on it.
let geminiExhausted = false;

async function askGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  if (geminiExhausted) throw new Error("Gemini quota exhausted for this run");
  const models = [
    process.env.GEMINI_MODEL,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-flash-latest",
  ].filter(Boolean);

  let lastError;
  let quotaHits = 0;
  for (const model of [...new Set(models)]) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const payload = await postJson(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 1.0,
              maxOutputTokens: 16384,
              responseMimeType: "application/json",
            },
          },
        );
        return { text: geminiText(payload), provider: `gemini:${model}` };
      } catch (error) {
        lastError = error;
        if (error.status === 404) break; // wrong model name, try the next
        if (error.status === 429) {
          quotaHits += 1;
          break; // quota is per model; jump to the next one
        }
        if (error.status >= 500) {
          await sleep(5_000);
          continue;
        }
        break;
      }
    }
  }
  if (lastError?.status === 429) geminiExhausted = true;
  throw lastError ?? new Error("Gemini failed");
}

/** Chat models only, best first. Groq's catalogue also lists audio models. */
const GROQ_PREFERRED = [
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "moonshotai/kimi-k2-instruct",
  "qwen/qwen3-32b",
  "llama-3.1-8b-instant",
];
const GROQ_NOT_CHAT = /whisper|tts|guard|embed|vision|prompt-?guard|distil/i;

async function groqModel(key) {
  const payload = await getJson("https://api.groq.com/openai/v1/models", {
    authorization: `Bearer ${key}`,
  });
  const ids = payload?.data?.map((model) => model.id) ?? [];
  const chat = ids.filter((id) => !GROQ_NOT_CHAT.test(id));
  return (
    GROQ_PREFERRED.find((id) => chat.includes(id)) ??
    chat.find((id) => /llama|qwen|kimi|gpt-oss|mixtral/i.test(id)) ??
    GROQ_PREFERRED[0]
  );
}

async function askGroq(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");
  const model = process.env.GROQ_MODEL || (await groqModel(key));

  let lastError;
  const maxTokens = 5000;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      // No response_format: Groq's strict JSON mode rejects valid-ish output
      // from reasoning models. parseJsonLoose handles fences and prose.
      const body = {
                  model,
          temperature: 0.8,
          max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      };
      // Reasoning tokens count against max_tokens; gpt-oss needs a low budget
      // or it thinks until the JSON is truncated mid-array.
      if (/gpt-oss/i.test(model)) body.reasoning_effort = "low";
      const payload = await postJson(
        "https://api.groq.com/openai/v1/chat/completions",
        body,
        { authorization: `Bearer ${key}` },
      );
      const text = payload?.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("empty Groq response");
      return { text, provider: `groq:${model}` };
    } catch (error) {
      lastError = error;
      if (error.status === 429) {
        // Groq tells us exactly how long to wait (TPM window).
        const match = /try again in ([\d.]+)\s*s/i.exec(error.message);
        const wait = match ? Math.ceil(Number(match[1]) * 1000) + 2_000 : 20_000;
        console.warn(`groq rate limit, waiting ${Math.round(wait / 1000)}s`);
        await sleep(Math.min(wait, 65_000));
        continue;
      }
      if (error.status >= 500) {
        await sleep(8_000);
        continue;
      }
      break;
    }
  }
  throw lastError ?? new Error("Groq failed");
}

async function getJson(url, headers, ms = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Ask whichever provider is configured, Gemini first, Groq second. */
export async function askModel(prompt) {
  const attempts = [];
  if (process.env.GEMINI_API_KEY) attempts.push(askGemini);
  if (process.env.GROQ_API_KEY) attempts.push(askGroq);
  if (!attempts.length) throw new Error("No model configured");

  let lastError;
  for (const attempt of attempts) {
    try {
      return await attempt(prompt);
    } catch (error) {
      lastError = error;
      console.warn(`provider fell through: ${error.message}`);
    }
  }
  throw lastError;
}

/* ------------------------------------------------------------------ */
/* Stub provider — local pipeline testing only (never selected in CI)  */
/* ------------------------------------------------------------------ */

const STUB_TRAITS = ["ember", "tide", "grove", "lantern", "spark", "orbit"];

function stubQuiz({ slug, title }) {
  const [ember, tide, grove, lantern, spark, orbit] = STUB_TRAITS;
  const w = (a, b) => ({ [a]: 2, [b]: 1 });
  const options = (pairs) =>
    pairs.map(([label, a, b], index) => ({
      id: "abcd"[index],
      label,
      weights: w(a, b),
    }));

  return {
    slug,
    title,
    dek: "A stub quiz used to exercise the automated pipeline end to end without calling a model.",
    category: "Life",
    accent: "sky",
    emoji: "🧪",
    minutes: 4,
    tiebreaker: "q12",
    questions: [
      {
        id: "q1",
        type: "mc",
        prompt: "A free afternoon appears. You:",
        options: options([
          ["Follow the first interesting thing", ember, tide],
          ["Finish something you started", grove, lantern],
          ["Call the person you keep meaning to call", spark, orbit],
          ["Sit still and let the day happen", tide, lantern],
        ]),
      },
      {
        id: "q2",
        type: "mc",
        prompt: "The plan falls apart. Your first move:",
        options: options([
          ["Improvise", ember, grove],
          ["Re-plan quietly", lantern, spark],
          ["Ask who else is affected", orbit, tide],
          ["Find the funny part", spark, grove],
        ]),
      },
      {
        id: "q3",
        type: "this_or_that",
        prompt: "The better evening:",
        options: options([
          ["A loud table", ember, spark],
          ["A quiet room", grove, orbit],
        ]),
      },
      {
        id: "q4",
        type: "image",
        prompt: "Your ideal setting looks like:",
        options: [
          { id: "a", label: "A library", weights: w(ember, tide), imageSearch: "library bookshelves", alt: "Tall shelves of books" },
          { id: "b", label: "Open water", weights: w(tide, grove), imageSearch: "ocean waves sunset", alt: "Waves at sunset" },
          { id: "c", label: "A forest path", weights: w(grove, lantern), imageSearch: "forest path trees", alt: "A path through forest" },
          { id: "d", label: "A lit city at night", weights: w(spark, orbit), imageSearch: "city skyline night", alt: "A city skyline at night" },
        ],
      },
      {
        id: "q5",
        type: "map",
        prompt: "Plot where you land.",
        helper: "Across: stay or go. Up: quiet or loud.",
        x: { low: { label: "Stay", trait: ember }, high: { label: "Go", trait: tide } },
        y: { low: { label: "Quiet", trait: grove }, high: { label: "Loud", trait: lantern } },
        quadrants: {
          lowLow: "The Workshop",
          lowHigh: "The Kitchen Party",
          highLow: "The Long Way",
          highHigh: "The Front Row",
        },
      },
      {
        id: "q6",
        type: "rank",
        prompt: "Rank what you'd save first.",
        items: [
          { id: "a", label: "The photos", weights: w(ember, spark) },
          { id: "b", label: "The notebook", weights: w(tide, orbit) },
          { id: "c", label: "The good chair", weights: w(grove, ember) },
          { id: "d", label: "The keepsake box", weights: w(lantern, tide) },
        ],
      },
      {
        id: "q7",
        type: "madlibs",
        prompt: "Fill in your week.",
        template: "This week I'm mostly {a}, and I keep {b}.",
        blanks: [
          {
            id: "a",
            options: [
              { id: "a1", label: "starting something", weights: w(ember, tide) },
              { id: "a2", label: "tidying one drawer", weights: w(grove, lantern) },
              { id: "a3", label: "replying to nobody", weights: w(orbit, spark) },
            ],
          },
          {
            id: "b",
            options: [
              { id: "b1", label: "meaning to text back", weights: w(spark, ember) },
              { id: "b2", label: "rewriting the plan", weights: w(lantern, grove) },
              { id: "b3", label: "walking the long way", weights: w(tide, orbit) },
            ],
          },
        ],
      },
      {
        id: "q8",
        type: "intensity",
        prompt: "I need to be doing something with my hands.",
        trait: spark,
        low: "Not really",
        high: "Constantly",
      },
      {
        id: "q9",
        type: "spectrum",
        prompt: "A good plan is worth more than a good detour.",
        disagree: { trait: tide },
        agree: { trait: lantern },
      },
      {
        id: "q10",
        type: "agreement",
        prompt: "I'd rather host than be hosted.",
        agree: { trait: ember, weight: 2 },
        disagree: { trait: grove, weight: 2 },
      },
      {
        id: "q11",
        type: "mc",
        prompt: "Someone cancels. You feel:",
        options: options([
          ["Relieved", orbit, grove],
          ["Restless", ember, spark],
          ["Suspicious", lantern, tide],
          ["Fine, honestly", grove, orbit],
        ]),
      },
      {
        id: "q12",
        type: "mc",
        prompt: "The last hour of the night is for:",
        options: options([
          ["One more conversation", ember, orbit],
          ["The walk home", tide, lantern],
          ["The kitchen clean-up", grove, spark],
          ["The group photo", spark, tide],
        ]),
      },
    ],
    results: STUB_TRAITS.map((trait, index) => {
      const mix = { [trait]: 45 };
      STUB_TRAITS.filter((other) => other !== trait).forEach((other) => {
        mix[other] = 11;
      });
      return {
        trait,
        name: ["Ember", "Tide", "Grove", "Lantern", "Spark", "Orbit"][index],
        tagline: "A stub result for pipeline testing",
        blurb:
          "This is placeholder copy that exists only so the automated pipeline can be tested without spending model tokens. It should never appear on the live site.",
        accent: ["red", "sky", "green", "yellow", "orange", "purple"][index],
        mix,
        strengths: ["Placeholder one", "Placeholder two", "Placeholder three"],
        watchOut: "Placeholder advice that is long enough to satisfy the validator.",
      };
    }),
  };
}

export async function askStub(prompt) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  if (/Return ONLY JSON: \{"ideas"/.test(prompt)) {
    return {
      text: JSON.stringify({
        ideas: [1, 2, 3, 4].map((index) => ({
          title: `Stub pipeline test ${index}`,
          topic: `stub topic ${index}`,
          category: "Life",
          angle: "placeholder",
          why: "pipeline test",
        })),
      }),
      provider: "stub",
    };
  }
  const suffix = Math.random().toString(36).slice(2, 6);
  const nouns = [
    "Lantern", "Harbor", "Meadow", "Pocket", "Signal", "Orchard", "Attic",
    "Compass", "Velvet", "Thunder", "Copper", "Willow", "Cactus", "Marble",
  ];
  const title = `${nouns[Math.floor(Math.random() * nouns.length)]} ${
    nouns[Math.floor(Math.random() * nouns.length)]
  } (stub ${suffix})`;
  return {
    text: JSON.stringify(
      stubQuiz({
        slug: `stub-pipeline-${date}-${suffix}`,
        title,
      }),
    ),
    provider: "stub",
  };
}
