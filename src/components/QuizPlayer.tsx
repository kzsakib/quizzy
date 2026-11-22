import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  scoreQuiz,
  type AnswerValue,
  type Answers,
  type PlayableQuiz,
  type Question,
} from "../lib/scoring";
import { getLenis } from "../lib/motion";
import QzSlider from "./QzSlider";

const AGREEMENT_LABELS = ["Hard no", "Nah", "Meh", "Yeah", "Hard yes"];

const TYPE_LABELS: Record<Question["type"], string> = {
  mc: "Pick one",
  this_or_that: "This or that",
  image: "Pick a picture",
  intensity: "How much is this you",
  spectrum: "How much do you agree",
  agreement: "Agree or disagree",
};

interface Props {
  quiz: PlayableQuiz;
}

export default function QuizPlayer({ quiz }: Props) {
  const total = quiz.questions.length;
  const answerKey = `qz:answers:${quiz.slug}`;
  const [answers, setAnswers] = useState<Answers>({});
  const hydrated = useRef(false);

  // Restore anything answered earlier in the session, so a refresh or a trip
  // to another tab does not wipe the whole sheet.
  useEffect(() => {
    let stored: Answers | null = null;
    try {
      const raw = sessionStorage.getItem(answerKey);
      if (raw) stored = JSON.parse(raw) as Answers;
    } catch {
      /* storage blocked */
    }

    hydrated.current = true;
    if (stored) setAnswers((previous) => ({ ...stored, ...previous }));
  }, [answerKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      sessionStorage.setItem(answerKey, JSON.stringify(answers));
    } catch {
      /* private mode: answers simply are not persisted */
    }
  }, [answers, answerKey]);

  const answeredCount = useMemo(
    () =>
      quiz.questions.filter((question) => answers[question.id] !== undefined)
        .length,
    [answers, quiz.questions],
  );
  const complete = answeredCount === total;
  const progress = Math.round((answeredCount / total) * 100);
  const firstUnanswered = quiz.questions.find(
    (question) => answers[question.id] === undefined,
  );

  const setAnswer = useCallback((id: string, value: AnswerValue) => {
    setAnswers((previous) => ({ ...previous, [id]: value }));
  }, []);

  const submit = useCallback(() => {
    if (answeredCount < total) return;
    const report = scoreQuiz(quiz, answers);
    try {
      sessionStorage.setItem(
        `qz:report:${quiz.slug}`,
        JSON.stringify(report),
      );
    } catch {
      /* private mode: the result page falls back to the signature mix */
    }
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    window.location.assign(`${base}/quiz/${quiz.slug}/result/${report.winner}/`);
  }, [answeredCount, answers, quiz, total]);

  return (
    <div className="mx-auto w-full max-w-[820px]">
      <div className="sticky top-[80px] z-30 flex items-center gap-2.5 rounded-[var(--r-pill)] border border-line bg-surface/85 px-3 py-2.5 backdrop-blur-md sm:top-[92px] sm:gap-3 sm:px-4">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-label="Quiz progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span
            className="block h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(progress, 2)}%` }}
          />
        </div>
        <p className="label shrink-0 tabular-nums text-[var(--ink-muted)]">
          {answeredCount}/{total}
        </p>
        <button
          type="button"
          onClick={
            complete
              ? submit
              : () => firstUnanswered && scrollToQuestion(firstUnanswered.id)
          }
          className="label shrink-0 rounded-[var(--r-pill)] bg-ink px-3.5 py-2 text-[var(--on-ink)] transition-transform duration-200 hover:-translate-y-0.5 sm:px-4"
        >
          {complete ? "See result" : `Jump to ${answeredCount + 1}`}
        </button>
      </div>

      <div className="mt-10">
        <p className="label text-[var(--ink-muted)]">
          {total} questions · one page · change anything, any time
        </p>
        <h2 className="display mt-3 text-[clamp(30px,4.6vw,50px)] leading-[0.95]">
          {quiz.title}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--ink-soft)]">
          {quiz.dek} Scroll down to work through them all. Answers save as you
          go, and nothing is submitted until you ask for a result.
        </p>
      </div>

      <div className="mt-10">
        {quiz.questions.map((question, i) => {
          const answered = answers[question.id] !== undefined;
          return (
            <section
              key={question.id}
              id={`q-${question.id}`}
              className="scroll-mt-[160px] border-t border-line/70 py-9 first:border-t-0 first:pt-0"
              aria-labelledby={`q-${question.id}-prompt`}
            >
              <div className="flex items-baseline gap-3">
                <span className="label w-6 shrink-0 tabular-nums text-[var(--ink-muted)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="label text-[var(--accent-text)]">
                      {TYPE_LABELS[question.type]}
                    </p>
                    <span
                      className={`label shrink-0 transition-opacity duration-300 ${
                        answered ? "text-[var(--ink-muted)] opacity-100" : "opacity-0"
                      }`}
                      aria-hidden="true"
                    >
                      Answered ✓
                    </span>
                  </div>
                  <h3
                    id={`q-${question.id}-prompt`}
                    className="display mt-2 text-[clamp(21px,3vw,30px)] leading-[1.02] text-balance"
                  >
                    {question.prompt}
                  </h3>
                  {question.helper ? (
                    <p className="mt-2 text-sm text-[var(--ink-muted)]">{question.helper}</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 sm:pl-9">
                <QuestionBody
                  question={question}
                  value={answers[question.id]}
                  onChange={(value) => setAnswer(question.id, value)}
                />
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-4 rounded-[var(--r-tile)] border border-line bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="label text-[var(--ink-muted)]">
              {complete ? "That's all of them" : `${total - answeredCount} left`}
            </p>
            <p className="display mt-3 max-w-[20ch] text-[clamp(26px,4vw,40px)] leading-[0.95]">
              {complete
                ? "Ready when you are."
                : "No result until every answer's in."}
            </p>
          </div>
          {complete ? (
            <button
              type="button"
              onClick={submit}
              className="label rounded-[var(--r-pill)] bg-[var(--accent)] px-6 py-3.5 text-[var(--on-accent)] transition-transform duration-200 hover:-translate-y-0.5"
            >
              See my result
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                firstUnanswered && scrollToQuestion(firstUnanswered.id)
              }
              className="label rounded-[var(--r-pill)] border border-line px-6 py-3.5 text-[var(--ink-strong)] transition-colors hover:border-ink/40 hover:text-ink"
            >
              Back to question {quiz.questions.indexOf(firstUnanswered!) + 1}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function scrollToQuestion(id: string): void {
  const target = document.getElementById(`q-${id}`);
  if (!target) return;

  const lenis = getLenis();
  if (lenis) {
    lenis.scrollTo(target, { offset: -150, duration: 1 });
    return;
  }

  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

interface BodyProps {
  question: Question;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
}

function QuestionBody({ question, value, onChange }: BodyProps) {
  if (
    question.type === "mc" ||
    question.type === "this_or_that" ||
    question.type === "image"
  ) {
    const twoUp = question.type === "this_or_that";
    const pictures = question.type === "image";

    return (
      <ul
        className={
          twoUp || pictures ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"
        }
        role="list"
      >
        {question.options.map((option, i) => {
          const selected = value === option.id;
          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => onChange(option.id)}
                aria-pressed={selected}
                className={[
                  "group relative flex h-full w-full overflow-hidden rounded-[var(--r-card)] border text-left transition-all duration-200",
                  pictures ? "flex-col" : "items-start gap-4 p-5",
                  twoUp ? "min-h-[132px] flex-col justify-between p-5" : "",
                  selected
                    ? "border-transparent bg-[var(--accent)] text-[var(--on-accent)] shadow-[0_10px_30px_-14px_var(--accent)]"
                    : "border-line bg-surface text-ink hover:-translate-y-0.5 hover:border-ink/35 hover:bg-surface-2",
                ].join(" ")}
              >
                {pictures && option.image ? (
                  <span className="relative block aspect-[4/3] w-full overflow-hidden bg-surface-2">
                    <img
                      src={option.image}
                      alt={option.alt ?? ""}
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    />
                    {selected ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 ring-4 ring-inset ring-[var(--accent)]"
                      />
                    ) : null}
                  </span>
                ) : null}

                {!pictures ? (
                  <span
                    className={[
                      "grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
                      selected
                        ? "bg-ink-dark/15 text-[var(--on-accent)]"
                        : "bg-surface-2 text-[var(--ink-muted)] group-hover:text-ink",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    {twoUp
                      ? i === 0
                        ? "A"
                        : "B"
                      : String.fromCharCode(65 + i)}
                  </span>
                ) : null}

                <span
                  className={[
                    pictures
                      ? "flex items-center gap-2 p-4 text-[15px] leading-snug"
                      : "text-[15px] leading-snug sm:text-base",
                    selected ? "text-[var(--on-accent)]" : "",
                  ].join(" ")}
                >
                  {pictures ? (
                    <span
                      aria-hidden="true"
                      className={[
                        "grid size-4 shrink-0 place-items-center rounded-full border",
                        selected
                          ? "border-ink-dark/40 bg-ink-dark/15"
                          : "border-ink/25",
                      ].join(" ")}
                    />
                  ) : null}
                  {option.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  if (question.type === "intensity") {
    const level = typeof value === "number" ? value : 3;
    return (
      <div className="rounded-[var(--r-card)] border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-4">
          <span className="label max-w-[36%] text-[var(--ink-muted)]">{question.low}</span>
          <span className="font-display text-3xl uppercase tabular-nums text-[var(--accent-text)]">
            {value === undefined ? "—" : `${level}/5`}
          </span>
          <span className="label max-w-[36%] text-right text-[var(--ink-muted)]">
            {question.high}
          </span>
        </div>

        <QzSlider
          min={1}
          max={5}
          value={level}
          onChange={onChange}
          label={question.prompt}
          valueText={value === undefined ? "Not answered" : `${level} out of 5`}
          marks={[1, 2, 3, 4, 5]}
          idle={value === undefined}
        />

        <p className="label flex items-center justify-between gap-4 text-[var(--ink-muted)]">
          <span>{value === undefined ? "Drag or tap to answer" : "Saved"}</span>
          <span aria-hidden="true">← →</span>
        </p>
      </div>
    );
  }

  if (question.type === "spectrum") {
    const position = typeof value === "number" ? value : 50;
    const answered = value !== undefined;
    const leaning = position === 50 ? "neither" : position > 50 ? "agree" : "disagree";
    return (
      <div className="rounded-[var(--r-card)] border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="label max-w-[34%] text-[var(--ink-muted)]">Strongly disagree</p>
          <p className="text-center">
            <span className="block font-display text-[clamp(34px,7vw,52px)] leading-none tabular-nums text-[var(--accent-text)]">
              {position}%
            </span>
            <span className="label mt-1.5 block text-[var(--ink-muted)]">
              {answered ? leaning : "not answered yet"}
            </span>
          </p>
          <p className="label max-w-[34%] text-right text-[var(--ink-muted)]">
            Strongly agree
          </p>
        </div>

        <QzSlider
          min={0}
          max={100}
          value={position}
          onChange={onChange}
          label={question.prompt}
          valueText={
            answered
              ? `${position} percent agreement with the statement`
              : "Not answered"
          }
          idle={!answered}
        />

        <p className="label flex items-center justify-between gap-4 text-[var(--ink-muted)]">
          <span>
            {!answered
              ? "Slide from 0 to 100%"
              : position === 50
                ? "Right in the middle"
                : `${Math.abs(position - 50) * 2}% ${leaning}`}
          </span>
          <span aria-hidden="true">← →</span>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--r-card)] border border-line bg-surface p-4 sm:p-6">
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {AGREEMENT_LABELS.map((label, step) => {
          const selected = value === step;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onChange(step)}
              aria-pressed={selected}
              className={[
                "flex min-h-[84px] flex-col items-center justify-end gap-2 rounded-[var(--r-control)] border px-1 pb-3 text-center text-[10px] font-semibold uppercase tracking-[0.04em] transition-all duration-200",
                selected
                  ? "border-transparent bg-[var(--accent)] text-[var(--on-accent)]"
                  : "border-line bg-surface-2 text-[var(--ink-soft)] hover:-translate-y-0.5 hover:border-ink/30 hover:text-ink",
              ].join(" ")}
            >
              <span
                aria-hidden="true"
                className={[
                  "mb-auto mt-3 rounded-full transition-all",
                  selected ? "size-3 bg-ink-dark" : "size-2.5 bg-ink/25",
                ].join(" ")}
              />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
