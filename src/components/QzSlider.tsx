import type { CSSProperties } from "react";

interface Props {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  /** Accessible name for the native range input. */
  label: string;
  valueText?: string;
  /** Non-interactive dots on the rail, for steppable scales like 1–5. */
  marks?: number[];
  /** Dims the thumb until the question has an answer. */
  idle?: boolean;
}

/**
 * A restyled native range input. The input stays in charge of dragging,
 * keyboard and touch; the visible track and thumb are separate elements so
 * the fill can sit exactly under the thumb. No detents, no snapping — the
 * thumb tracks the pointer continuously.
 */
export default function QzSlider({
  min = 0,
  max = 100,
  step = 1,
  value,
  onChange,
  label,
  valueText,
  marks = [],
  idle = false,
}: Props) {
  const span = max - min || 1;
  const frac = (Math.min(max, Math.max(min, value)) - min) / span;
  const style = {
    "--qz-frac": `${frac}`,
    "--qz-fill": `${frac * 100}%`,
  } as CSSProperties;

  return (
    <div className={`qz-slider${idle ? " qz-slider--idle" : ""}`} style={style}>
      <div className="qz-slider__rail">
        <span className="qz-slider__track" aria-hidden="true" />
        {marks.length > 1 ? (
          <span className="qz-slider__marks" aria-hidden="true">
            {marks.map((mark) => (
              <span
                key={mark}
                className="qz-slider__mark"
                style={
                  { "--qz-mark": `${(mark - min) / span}` } as CSSProperties
                }
              />
            ))}
          </span>
        ) : null}
        <span className="qz-slider__thumb" aria-hidden="true" />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={label}
          aria-valuetext={valueText}
          className="qz-slider__input"
        />
      </div>
    </div>
  );
}
