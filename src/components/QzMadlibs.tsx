import { useState } from "react";

interface BlankOption {
  id: string;
  label: string;
}

interface Blank {
  id: string;
  options: BlankOption[];
}

interface Props {
  template: string;
  blanks: Blank[];
  value: Record<string, string> | undefined;
  onChange: (value: Record<string, string>) => void;
}

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * A sentence with inline gaps. The sentence itself is the control: tap a gap to
 * open its phrases, pick one, and the next unfilled gap opens for you.
 */
export default function QzMadlibs({ template, blanks, value, onChange }: Props) {
  const filled = value ?? {};
  const firstOpen = blanks.find((blank) => !filled[blank.id])?.id;
  const [open, setOpen] = useState<string | null>(
    firstOpen ?? blanks[0]?.id ?? null,
  );

  const active = blanks.find((blank) => blank.id === open) ?? blanks[0];
  const activeIndex = blanks.findIndex((blank) => blank.id === active?.id);
  const picked = active ? filled[active.id] : undefined;

  const choose = (optionId: string) => {
    if (!active) return;
    const next = { ...filled, [active.id]: optionId };
    onChange(next);
    const nextBlank = blanks.find((blank) => !next[blank.id]);
    setOpen(nextBlank ? nextBlank.id : null);
  };

  // Split the template into literal text and gap tokens, keeping order.
  const parts: Array<{ text: string } | { blank: Blank }> = [];
  let cursor = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    if (match.index > cursor) {
      parts.push({ text: template.slice(cursor, match.index) });
    }
    const blank = blanks.find((entry) => entry.id === match[1]);
    if (blank) parts.push({ blank });
    cursor = match.index + match[0].length;
  }
  if (cursor < template.length) parts.push({ text: template.slice(cursor) });

  return (
    <div className="rounded-[var(--r-card)] border border-line bg-surface p-5 sm:p-6">
      <p className="serif-italic text-[clamp(21px,3.2vw,29px)] leading-[1.4] text-[var(--ink-strong)]">
        {parts.map((part, index) =>
          "text" in part ? (
            <span key={`t-${index}`}>{part.text}</span>
          ) : (
            <button
              key={`b-${part.blank.id}`}
              type="button"
              aria-expanded={open === part.blank.id}
              onClick={() =>
                setOpen(open === part.blank.id ? null : part.blank.id)
              }
              className={`mx-0.5 rounded-[6px] px-1.5 py-0.5 text-left align-baseline transition-colors duration-200 ${
                filled[part.blank.id]
                  ? "bg-[var(--accent)]/18 text-[var(--ink)] underline decoration-[var(--accent)] decoration-2 underline-offset-[5px]"
                  : "border-b-2 border-dashed border-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent)]/10"
              } ${open === part.blank.id ? "bg-[var(--accent)]/10 ring-2 ring-[var(--accent)]/40" : ""}`}
            >
              {filled[part.blank.id]
                ? blanks
                    .find((blank) => blank.id === part.blank.id)
                    ?.options.find((option) => option.id === filled[part.blank.id])
                    ?.label
                : `gap ${blanks.findIndex((blank) => blank.id === part.blank.id) + 1}`}
            </button>
          ),
        )}
      </p>

      {active ? (
        <div className="mt-5 border-t border-line/70 pt-4">
          <p className="label flex items-center justify-between gap-3 text-[var(--ink-muted)]">
            <span>
              Gap {activeIndex + 1} of {blanks.length}
            </span>
            <span>{picked ? "Change your pick" : "Pick a phrase"}</span>
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2" role="list">
            {active.options.map((option, index) => {
              const selected = picked === option.id;
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => choose(option.id)}
                    aria-pressed={selected}
                    className={`flex h-full w-full items-start gap-2.5 rounded-[var(--r-control)] border px-3.5 py-3 text-left text-[14px] leading-snug transition-all duration-200 ${
                      selected
                        ? "border-transparent bg-[var(--accent)] text-[var(--on-accent)]"
                        : "border-line bg-surface-2 text-[var(--ink-strong)] hover:-translate-y-0.5 hover:border-ink/35"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`label mt-0.5 shrink-0 ${
                        selected
                          ? "text-[var(--on-accent)]"
                          : "text-[var(--ink-muted)]"
                      }`}
                    >
                      {String.fromCharCode(65 + index)}
                    </span>
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="label mt-4 border-t border-line/70 pt-4 text-[var(--accent-text)]">
          Both gaps filled. Change either one any time.
        </p>
      )}
    </div>
  );
}
