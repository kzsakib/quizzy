/**
 * Fresh-but-free topic signal.
 *
 * Two public feeds, no keys: Google Trends' RSS and BuzzFeed's quiz RSS.
 * Both are best-effort — any failure just returns an empty list, because the
 * generator must never fail because a feed is down or blocked.
 */

const UA = "QuizzyQuizFactory/1.0 (personality quiz site; contact: site owner)";

async function getText(url, ms = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml, */*" },
      signal: controller.signal,
    });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function titles(xml, limit) {
  return [...xml.matchAll(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g)]
    .map((match) => match[1].replace(/&amp;/g, "&").replace(/&#\d+;/g, "").trim())
    .filter((title) => title && !/^rss|google trends|buzzfeed/i.test(title))
    .slice(0, limit);
}

export async function research() {
  const [trends, quizzes] = await Promise.all([
    getText("https://trends.google.com/trending/rss?geo=US"),
    getText("https://www.buzzfeed.com/quizzes.xml"),
  ]);

  return {
    trends: titles(trends, 10),
    buzzfeed: titles(quizzes, 12),
  };
}

export function researchLine(signal) {
  const parts = [];
  if (signal.trends.length) parts.push(`Trending searches: ${signal.trends.join(", ")}`);
  if (signal.buzzfeed.length) {
    parts.push(`Quiz headlines circulating: ${signal.buzzfeed.join(" / ")}`);
  }
  return parts.length ? parts.join("\n") : "(no signal available — rely on the seed bank)";
}
