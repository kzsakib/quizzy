import { useEffect, useState } from "react";
import type { ScoreReport, WeightMap } from "../lib/scoring";

interface ResultSummary {
  trait: string;
  name: string;
  accent: string;
}

interface Props {
  quizSlug: string;
  trait: string;
  mix: WeightMap;
  results: ResultSummary[];
}

export default function ResultChart({ quizSlug, trait, mix, results }: Props) {
  const [shares, setShares] = useState<WeightMap>(mix);
  const [personalised, setPersonalised] = useState(false);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`qz:report:${quizSlug}`);
      if (!raw) return;
      const report = JSON.parse(raw) as ScoreReport;
      if (report?.shares && report.winner === trait) {
        setShares(report.shares);
        setPersonalised(true);
      }
    } catch {
      /* ignore malformed or blocked storage */
    }
  }, [quizSlug, trait]);

  useEffect(() => {
    const id = window.setTimeout(() => setDrawn(true), 80);
    return () => window.clearTimeout(id);
  }, []);

  const total =
    Object.values(shares).reduce((sum, value) => sum + value, 0) || 1;
  const ordered = [...results].sort(
    (a, b) => (shares[b.trait] ?? 0) - (shares[a.trait] ?? 0),
  );
  const winnerPct = Math.round(((shares[trait] ?? 0) / total) * 100);

  const size = 280;
  const stroke = 30;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = 7;

  let offset = 0;

  return (
    <div className="mx-auto grid w-full max-w-[660px] items-center justify-items-center gap-10 sm:grid-cols-[280px_minmax(0,1fr)] sm:justify-items-stretch sm:gap-10">
      <div className="relative mx-auto aspect-square w-full max-w-[280px]">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="size-full -rotate-90"
          role="img"
          aria-label={`Score mix: ${ordered
            .map(
              (r) =>
                `${r.name} ${Math.round(((shares[r.trait] ?? 0) / total) * 100)}%`,
            )
            .join(", ")}`}
        >
          {ordered.map((result) => {
            const value = shares[result.trait] ?? 0;
            const length = (value / total) * circumference;
            const dash = Math.max(length - gap, 0);
            const circle = (
              <circle
                key={result.trait}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={`var(--accent-${result.accent})`}
                strokeWidth={result.trait === trait ? stroke : stroke - 7}
                strokeLinecap="butt"
                strokeDasharray={
                  drawn
                    ? `${dash} ${circumference - dash}`
                    : `0 ${circumference}`
                }
                strokeDashoffset={-offset}
                style={{
                  transition:
                    "stroke-dasharray 900ms cubic-bezier(0.22,1,0.36,1)",
                }}
              />
            );
            offset += length;
            return circle;
          })}
        </svg>

        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div className="px-10">
            <p className="display text-[clamp(38px,7vw,54px)] leading-none tabular-nums">
              {winnerPct}%
            </p>
            <p className="label mx-auto mt-2 max-w-[14ch] text-[var(--ink-muted)]">
              {results.find((r) => r.trait === trait)?.name}
            </p>
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <ul className="space-y-3" role="list">
          {ordered.map((result) => {
            const pct = Math.round(
              ((shares[result.trait] ?? 0) / total) * 100,
            );
            const isWinner = result.trait === trait;
            return (
              <li
                key={result.trait}
                className={[
                  "grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-3",
                  isWinner ? "text-ink" : "text-[var(--ink-strong)]",
                ].join(" ")}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ background: `var(--accent-${result.accent})` }}
                />
                <span className="truncate text-sm">{result.name}</span>
                <span
                  className={[
                    "label tabular-nums",
                    isWinner ? "text-[var(--ink-strong)]" : "text-[var(--ink-soft)]",
                  ].join(" ")}
                >
                  {pct}%
                </span>
              </li>
            );
          })}
        </ul>

        <p className="label mt-6 text-[var(--ink-soft)]">
          {personalised
            ? "Your answers, scored"
            : "Signature mix — retake to see yours"}
        </p>
      </div>
    </div>
  );
}
