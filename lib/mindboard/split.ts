import { pluralRu } from "@/lib/tasks/status-text";

/**
 * A typed or pasted list as the lines of a board (D-140): «Разбить на 5 пунктов». A
 * director pastes the agenda from a messenger or types it line by line — one line is one
 * point, and the details under a point are its sub-points, as the eye reads them: a line
 * indented deeper than the list, or a bullet («- аренда») under numbered points («1. Склад»).
 * Markers are dropped — the board numbers its points itself. Pure — tests in `split.test.ts`.
 */

export type SplitPoint = { text: string; children: string[] };

type Kind = "number" | "bullet" | "plain";
type Line = { indent: number; kind: Kind; text: string };

const NUMBER = /^(?:\d{1,3}[.)]|[a-zа-яё]\))\s+/i;
const BULLET = /^[-–—•*·▪●◦]\s+/;

function parse(raw: string): Line {
  const lead = /^[\t ]*/.exec(raw)?.[0] ?? "";
  const indent = [...lead].reduce((sum, char) => sum + (char === "\t" ? 4 : 1), 0);
  const rest = raw.slice(lead.length);
  const kind: Kind = NUMBER.test(rest) ? "number" : BULLET.test(rest) ? "bullet" : "plain";
  const text = rest.replace(kind === "number" ? NUMBER : kind === "bullet" ? BULLET : /^/, "").replace(/\s+/g, " ").trim();
  return { indent, kind, text };
}

/** The points of a list, each with its sub-points; null — fewer than two lines, nothing to split. */
export function splitList(text: string): SplitPoint[] | null {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(parse)
    .filter((line) => line.text !== "");
  if (lines.length < 2) return null;
  const base = Math.min(...lines.map((line) => line.indent));
  const top = lines.filter((line) => line.indent === base);
  // «1. …» are the points and «- …» under them their details — when the list mixes both
  const bulletsAreDetails = top.some((line) => line.kind === "number") && top.some((line) => line.kind === "bullet");
  const points: SplitPoint[] = [];
  for (const line of lines) {
    const detail = line.indent > base || (bulletsAreDetails && line.kind === "bullet");
    const point = points[points.length - 1];
    if (detail && point) point.children.push(line.text);
    else points.push({ text: line.text, children: [] });
  }
  return points;
}

/** «Разбить на 5 пунктов», «Разбить: 2 пункта · 3 подпункта». */
export function splitLabel(points: readonly SplitPoint[]): string {
  const subs = points.reduce((sum, point) => sum + point.children.length, 0);
  return subs === 0 ? `Разбить на ${splitCounts(points)}` : `Разбить: ${splitCounts(points)}`;
}

/** «5 пунктов», «2 пункта · 3 подпункта» — what a split makes. */
export function splitCounts(points: readonly SplitPoint[]): string {
  const total = points.length;
  const subs = points.reduce((sum, point) => sum + point.children.length, 0);
  const pointsWord = `${total} ${pluralRu(total, ["пункт", "пункта", "пунктов"])}`;
  return subs === 0 ? pointsWord : `${pointsWord} · ${subs} ${pluralRu(subs, ["подпункт", "подпункта", "подпунктов"])}`;
}

/** Every line of a pasted list as one flat row — for the sub-points of one point. */
export function flatLines(text: string): string[] {
  return (splitList(text) ?? []).flatMap((point) => [point.text, ...point.children]);
}
