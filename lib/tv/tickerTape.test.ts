import { describe, expect, it } from "vitest";

import type { TickerItem } from "./ticker";
import {
  tapeCopies,
  tapeKey,
  tapeLoop,
  tapeOf,
  tapeOffset,
  tapeRephase,
  tapeSettle,
  tapeSplice,
  tapeWindow,
  type Tape,
  type TapeGeometry,
} from "./tickerTape";

const item = (id: string, text = `Пункт ${id}`, tone: TickerItem["tone"] = "accent"): TickerItem => ({ id, text, tone });

/** Замер дорожки: ширина каждого пункта по id (по умолчанию 500), вход и копия ленты подряд, без зазоров. */
function measure(tape: Tape, widths: Record<string, number> = {}): TapeGeometry {
  const place = (items: readonly TickerItem[]) => {
    let left = 0;
    const spans = items.map((it) => {
      const width = widths[it.id] ?? 500;
      const span = { id: it.id, left, width };
      left += width;
      return span;
    });
    return { spans, width: left };
  };
  const lead = place(tape.lead);
  const run = place(tape.run);
  return { lead: lead.spans, leadWidth: lead.width, run: run.width, spans: run.spans };
}

/** Что видно на экране: пункты и где они стоят относительно левого края окна. */
function screen(tape: Tape, geo: TapeGeometry, offset: number, view: number) {
  return tapeWindow(geo, offset, view).map((slot) => {
    const it = (slot.lead ? tape.lead : tape.run)[slot.index];
    return `${it.id}:${it.text}@${Math.round(slot.left - offset)}`;
  });
}

// five items of 500 px: one run is 2500 px, the window is 1000 px
const A = [item("a"), item("b"), item("c"), item("d"), item("e")];
const TAPE = tapeOf(A);
const GEO = measure(TAPE);

describe("tapeCopies", () => {
  it("длинная лента — две копии, короткая — сколько нужно, чтобы край не въехал в экран", () => {
    expect(tapeCopies(7000, 1910)).toBe(2);
    expect(tapeCopies(1910, 1910)).toBe(2);
    expect(tapeCopies(900, 1910)).toBe(4);
    expect(tapeCopies(0, 1910)).toBe(2);
  });
});

describe("tapeOffset", () => {
  it("сдвиг по времени и скорости — внутри круга", () => {
    expect(tapeOffset(1000, 90, 7000)).toBe(90);
    expect(tapeOffset(100_000, 90, 7000)).toBe(2000);
    expect(tapeOffset(5000, 90, 0)).toBe(0);
  });
});

describe("tapeWindow", () => {
  it("пункты в окне слева направо, через стык копий", () => {
    expect(tapeWindow(GEO, 0, 1000).map((s) => s.index)).toEqual([0, 1]);
    expect(tapeWindow(GEO, 250, 1000).map((s) => s.index)).toEqual([0, 1, 2]);
    // 2200…3200: e, then a and b of the next copy
    const across = tapeWindow(GEO, 2200, 1000);
    expect(across.map((s) => [s.index, s.copy, s.left])).toEqual([
      [4, 0, 2000],
      [0, 1, 2500],
      [1, 1, 3000],
    ]);
  });

  it("запас по краям захватывает соседей; без входа до начала дорожки — прошлый круг", () => {
    expect(tapeWindow(GEO, 500, 1000, 10).map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(tapeWindow(GEO, 0, 1000, 10).map((s) => [s.index, s.copy])).toEqual([
      [4, -1],
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
  });

  it("короткая лента видна целиком не один раз", () => {
    const geo = measure(tapeOf([item("a"), item("b")]), { a: 300, b: 300 });
    expect(tapeWindow(geo, 0, 1000).map((s) => s.index)).toEqual([0, 1, 0, 1]);
  });

  it("вход — один раз в начале дорожки, за ним копии ленты", () => {
    const tape: Tape = { lead: [item("x"), item("y")], run: A, source: A };
    const geo = measure(tape, { x: 300, y: 300 });
    expect(geo.leadWidth).toBe(600);
    expect(tapeWindow(geo, 100, 1000).map((s) => [s.lead, s.index, s.left])).toEqual([
      [true, 0, 0],
      [true, 1, 300],
      [false, 0, 600],
    ]);
  });
});

describe("tapeSplice → tapeSettle: новые слова, а на экране ничего не шелохнулось", () => {
  const VIEW = 1000;
  const MARGIN = 20;

  /** Смена ленты на сдвиге `offset`; экран до, сразу после и после того, как вход уехал. */
  function walk(next: TickerItem[], offset: number, widths: Record<string, number> = {}) {
    const before = screen(TAPE, GEO, offset, VIEW);
    const spliced = tapeSplice(TAPE, GEO, offset, VIEW, next, MARGIN);
    const geo = measure(spliced, widths);
    const at = offset - (spliced.shift ?? 0);
    const after = screen(spliced, geo, at, VIEW);
    return { before, after, spliced, geo, at };
  }

  it("новый пункт посреди экрана не выскакивает: видимое остаётся входом, новое — дальше по кругу", () => {
    const next = [A[0], item("new"), A[1], A[2], A[3], A[4]];
    const { before, after, spliced } = walk(next, 250);
    expect(after).toEqual(before);
    // on screen 230…1270 (with the margin): a, b, c; after them the new tape goes on from d
    expect(spliced.lead.map((it) => it.id)).toEqual(["a", "b", "c"]);
    expect(spliced.run.map((it) => it.id)).toEqual(["d", "e", "a", "new", "b", "c"]);
    expect(spliced.source).toBe(next);
  });

  it("слова видимого пункта поменялись — на экране старые, пока он не уедет; дальше по кругу — новые", () => {
    const next = A.map((it) => (it.id === "b" ? { ...it, text: "Сегодня: 15 поручений" } : it));
    const { before, after, spliced } = walk(next, 0, { b: 640 });
    expect(after).toEqual(before);
    expect(spliced.lead.find((it) => it.id === "b")?.text).toBe("Пункт b");
    expect(spliced.run.find((it) => it.id === "b")?.text).toBe("Сегодня: 15 поручений");
  });

  it("видимый пункт исчез из ленты — доезжает до края, лента продолжается с его соседа", () => {
    const next = A.filter((it) => it.id !== "b");
    const { before, after, spliced } = walk(next, 600);
    expect(after).toEqual(before);
    // window 580…1620: b, c, d; after d comes e
    expect(spliced.run.map((it) => it.id)).toEqual(["e", "a", "c", "d"]);
  });

  it("ни одного видимого в новой ленте — вход доезжает, за ним лента с начала", () => {
    const next = [item("x"), item("y")];
    const { after, before, spliced } = walk(next, 600);
    expect(after).toEqual(before);
    expect(spliced.run).toEqual(next);
  });

  it("на стыке копий и с запасом слева — тот же экран", () => {
    const next = [item("new"), ...A];
    for (const offset of [0, 5, 2200, 2490]) {
      const { before, after } = walk(next, offset);
      expect(after).toEqual(before);
    }
  });

  it("вход уехал — дорожка снова из копий, экран тот же, и так на любом шаге", () => {
    const next = [A[0], item("new"), A[1], A[2], A[3], A[4]];
    const { spliced, geo, at } = walk(next, 250);
    // still on screen: not yet
    expect(tapeSettle(spliced, geo, at + 500, MARGIN)).toBeNull();
    for (const step of [geo.leadWidth + MARGIN, geo.leadWidth + 700, geo.leadWidth + 2900]) {
      const settled = tapeSettle(spliced, geo, step, MARGIN);
      expect(settled).not.toBeNull();
      const flat = measure(settled!);
      expect(settled!.lead).toEqual([]);
      expect(settled!.run).toBe(spliced.run);
      const x = ((step - (settled!.shift ?? 0)) % tapeLoop(flat) + tapeLoop(flat)) % tapeLoop(flat);
      expect(screen(settled!, flat, x, VIEW)).toEqual(screen(spliced, geo, step, VIEW));
    }
  });

  it("новые слова, пока вход ещё на экране, — снова тот же экран", () => {
    const first = walk([A[0], item("n1"), ...A.slice(1)], 250);
    const again = [A[0], item("n2"), item("n1"), ...A.slice(1)];
    const x = first.at + 300;
    const spliced = tapeSplice(first.spliced, first.geo, x, VIEW, again, MARGIN);
    const geo = measure(spliced);
    expect(screen(spliced, geo, x - (spliced.shift ?? 0), VIEW)).toEqual(screen(first.spliced, first.geo, x, VIEW));
  });

  it("пустая лента — сразу новая", () => {
    expect(tapeSplice(tapeOf([]), measure(tapeOf([])), 0, VIEW, A, MARGIN).run).toEqual(A);
    expect(tapeSplice(TAPE, GEO, 300, VIEW, [], MARGIN).run).toEqual([]);
  });

  it("без входа успокаиваться нечему", () => {
    expect(tapeSettle(TAPE, GEO, 1200, MARGIN)).toBeNull();
  });
});

describe("tapeRephase", () => {
  it("шрифт догрузился: пункт у левого края держит место", () => {
    const wider = measure(TAPE, { a: 520, b: 520, c: 520, d: 520, e: 520 });
    // b at 500…1000, the edge at 600: b starts 100 px left of it; in the wider tape b starts at 520
    expect(tapeRephase(GEO, 600, 1000, wider)).toBe(620);
  });

  it("у стыка копий — та же копия", () => {
    // window 2400…3400: e (2000…2500) is 400 px left of the edge
    const wider = measure(TAPE, { a: 600, b: 600, c: 600, d: 600, e: 600 });
    expect(tapeRephase(GEO, 2400, 1000, wider)).toBe(2800);
  });

  it("со входом — пункт входа", () => {
    const tape: Tape = { lead: [item("x"), item("y")], run: A, source: A };
    const before = measure(tape, { x: 300, y: 300 });
    const after = measure(tape, { x: 330, y: 330 });
    // y at 300…600, the edge at 350: 50 px left of it; y now at 330
    expect(tapeRephase(before, 350, 1000, after)).toBe(380);
  });
});

describe("tapeKey", () => {
  it("меняется от слов, тона и порядка", () => {
    const base = tapeKey(A);
    expect(tapeKey([...A])).toBe(base);
    expect(tapeKey([A[1], A[0], ...A.slice(2)])).not.toBe(base);
    expect(tapeKey(A.map((it, i) => (i === 0 ? { ...it, text: "другое" } : it)))).not.toBe(base);
    expect(tapeKey(A.map((it, i) => (i === 0 ? { ...it, tone: "ok" as const } : it)))).not.toBe(base);
  });
});
