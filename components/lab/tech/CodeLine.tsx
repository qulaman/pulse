import type { CSSProperties, ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/* A line of code, lightly coloured                                            */
/* -------------------------------------------------------------------------- */

// strings (with a key's colon), the arrows and marks, numbers, and the few words of SQL and HTTP
const TOKEN =
  /(«[^»]*»?|"[^"]*"|'[^']*')(\s*:)?|(←|→|✓|✕)|(\b\d+(?:[.,:]\d+)*\b)|\b(POST|PUT|GET|rpc|insert into|update|set|on conflict do nothing|for update skip locked|security definer|create policy|using|select|and|or)\b/g;

const MARK_COLOR: Record<string, string> = { "←": "var(--accent)", "→": "var(--accent)", "✓": "var(--ok)", "✕": "var(--danger)" };

function splitComment(line: string): [string, string] {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("--") || trimmed.startsWith("//")) return ["", line];
  const at = line.search(/\s(--|\/\/)\s/);
  return at < 0 ? [line, ""] : [line.slice(0, at), line.slice(at)];
}

/** One line of the lab's code panels: `--` and `//` start a comment, `←` marks what came back. */
export function CodeLine({ text }: { text: string }) {
  const [body, comment] = splitComment(text);
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of body.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(body.slice(last, start));
    const [whole, str, colon, mark, num, word] = match;
    if (str && colon) {
      parts.push(
        <span key={start} className="text-muted">
          {str}
          {colon}
        </span>,
      );
    } else if (str) {
      parts.push(
        <span key={start} style={{ color: "color-mix(in srgb, var(--accent) 35%, var(--text))" }}>
          {str}
        </span>,
      );
    } else if (mark) {
      parts.push(
        <span key={start} style={{ color: MARK_COLOR[mark] }}>
          {mark}
        </span>,
      );
    } else if (num) {
      parts.push(
        <span key={start} style={{ color: "var(--gold)" }}>
          {num}
        </span>,
      );
    } else if (word) {
      parts.push(
        <span key={start} className="font-semibold" style={{ color: "var(--accent)" }}>
          {word}
        </span>,
      );
    }
    last = start + whole.length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return (
    <>
      {parts}
      {comment ? <span className="text-muted opacity-80">{comment}</span> : null}
    </>
  );
}

/** A wrapped line goes on two characters deeper than its own indent, so the code keeps its shape. */
export function hang(line: string): CSSProperties {
  const depth = line.length - line.trimStart().length + 2;
  return { paddingLeft: `${depth}ch`, textIndent: `-${depth}ch` };
}
