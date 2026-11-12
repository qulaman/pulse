import styles from "./HazeWords.module.css";

/** However long the line, the last word is in sight by then. */
const WHOLE_S = 0.7;
const STEP_S = 0.04;

/**
 * A line said by the assistant: each word comes out of a light haze a moment after the one
 * before it, as a written answer appears (D-166). The text is all there from the first frame —
 * for a screen reader, a copy and a test it is one plain string; only its look arrives.
 */
export function HazeWords({ text, delay = 0 }: { text: string; delay?: number }) {
  const words = text.split(/\s+/).filter(Boolean);
  const step = Math.min(STEP_S, WHOLE_S / Math.max(1, words.length));
  return (
    <>
      {words.map((word, i) => (
        <span key={`${i}:${word}`}>
          <span className={styles.word} style={{ animationDelay: `${(delay + i * step).toFixed(3)}s` }}>
            {word}
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </>
  );
}
