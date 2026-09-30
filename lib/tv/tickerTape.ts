import type { TickerItem } from "./ticker";

/**
 * Лента бегущей строки (D-121, третья волна) — чистыми функциями. Строка едет на
 * композиторе: CSS-анимация сдвигает дорожку и начинает заново, React в кадрах не
 * участвует. Дорожка — «вход» (что было на экране в момент смены ленты, один раз) и за ним
 * копии ленты подряд. Без входа дорожка сдвигается на ширину одной копии — в момент
 * возврата на месте первой копии стоит вторая, шва не видно.
 *
 * Как лента меняется на ходу, ничего не дёргая на экране:
 *  1. пришли новые слова — то, что сейчас видно, остаётся входом дорожки ровно там же, а
 *     за ним сразу идёт новая лента с того пункта, что следует за последним видимым
 *     (`tapeSplice`). Новое въезжает справа, когда до него дойдёт очередь;
 *  2. вход уехал за левый край — дорожка снова только из копий ленты (`tapeSettle`), и на
 *     экране опять ничего не меняется: видны те же пункты тех же копий.
 * Все размеры — в пикселях дорожки, слева направо от её начала.
 */

/** Пункт на дорожке: где начинается (вход — от начала дорожки, лента — от начала копии) и какой ширины. */
export type TapeSpan = { id: string; left: number; width: number };

/** Что едет по дорожке: вход (один раз), лента (по кругу) и из каких слов она собрана. */
export type Tape = {
  lead: TickerItem[];
  run: TickerItem[];
  /** Лента как она пришла — до поворота к месту на экране; по ней видно, изменились ли слова. */
  source: TickerItem[];
  /**
   * Где на прежней дорожке начиналась эта: сдвиг на экране продолжается с `прежний − shift`.
   * Нет — дорожка новая, едет с начала.
   */
  shift?: number;
};

/** Замер дорожки: вход и одна копия ленты (её ширина — период). */
export type TapeGeometry = { lead: TapeSpan[]; leadWidth: number; run: number; spans: TapeSpan[] };

/** Пункт в окне: из входа или из какой копии ленты, какой по счёту, где на дорожке. */
export type TapeSlot = { lead: boolean; copy: number; index: number; left: number; width: number };

const mod = (value: number, by: number) => ((value % by) + by) % by;

/** Лента без входа: так дорожка стоит всегда, кроме нескольких секунд после смены слов. */
export function tapeOf(items: TickerItem[]): Tape {
  return { lead: [], run: items, source: items };
}

/**
 * Сколько копий ленты на дорожке: окно шириной `view` в любой момент должно видеть только
 * ленту. Лента сдвигается на одну копию, поэтому копий — на ширину окна и ещё одна; и не
 * меньше двух (короткий день — короткая лента, но экран не должен пустеть справа).
 */
export function tapeCopies(run: number, view: number): number {
  if (!(run > 0)) return 2;
  return Math.max(2, Math.ceil(view / run) + 1);
}

/** Круг анимации: вход (один раз) и одна копия ленты. */
export function tapeLoop(geo: TapeGeometry): number {
  return geo.leadWidth + geo.run;
}

/** Насколько дорожка уехала влево за `elapsedMs` мс при скорости `speed` px/с — внутри круга `loop`. */
export function tapeOffset(elapsedMs: number, speed: number, loop: number): number {
  if (!(loop > 0)) return 0;
  return mod((elapsedMs / 1000) * speed, loop);
}

/**
 * Что видно в окне: дорожка уехала на `offset`, окно шириной `view`, с запасом `margin` по
 * краям. Пункты — слева направо; пункт короткой ленты может встретиться не один раз. Без
 * входа лента бесконечна в обе стороны (до начала дорожки — прошлый круг).
 */
export function tapeWindow(geo: TapeGeometry, offset: number, view: number, margin = 0): TapeSlot[] {
  const from = offset - margin;
  const to = offset + view + margin;
  const slots: TapeSlot[] = [];
  geo.lead.forEach((span, index) => {
    if (span.left + span.width > from && span.left < to) slots.push({ lead: true, copy: 0, index, left: span.left, width: span.width });
  });
  if (!(geo.run > 0) || geo.spans.length === 0) return slots;
  const first = geo.leadWidth > 0 ? 0 : Math.floor(from / geo.run);
  for (let copy = first; geo.leadWidth + copy * geo.run < to; copy++) {
    geo.spans.forEach((span, index) => {
      const left = geo.leadWidth + copy * geo.run + span.left;
      if (left + span.width > from && left < to) slots.push({ lead: false, copy, index, left, width: span.width });
    });
  }
  return slots;
}

/**
 * Новые слова на ходу. Всё, что сейчас в окне (с запасом `margin`), становится входом новой
 * дорожки — теми же словами, в том же порядке, на тех же местах экрана. За входом — новая
 * лента, повёрнутая так, чтобы после последнего видимого пункта шёл его следующий; видимого
 * в новой ленте нет — его ближайший видимый сосед слева; никого — лента с начала.
 */
export function tapeSplice(tape: Tape, geo: TapeGeometry, offset: number, view: number, next: TickerItem[], margin = 0): Tape {
  const slots = tapeWindow(geo, offset, view, margin);
  if (slots.length === 0 || next.length === 0) return { ...tapeOf(next), shift: offset };
  const lead = slots.map((slot) => (slot.lead ? tape.lead : tape.run)[slot.index]);
  let after = -1;
  for (let at = lead.length - 1; at >= 0 && after < 0; at--) after = next.findIndex((item) => item.id === lead[at].id);
  const start = after < 0 ? 0 : (after + 1) % next.length;
  return { lead, run: [...next.slice(start), ...next.slice(0, start)], source: next, shift: slots[0].left };
}

/**
 * Вход уехал за левый край (с запасом `margin`) — дорожка снова только из копий ленты; на
 * экране те же пункты тех же копий. Ещё не уехал — null.
 */
export function tapeSettle(tape: Tape, geo: TapeGeometry, offset: number, margin = 0): Tape | null {
  if (tape.lead.length === 0 || offset - margin < geo.leadWidth) return null;
  return { lead: [], run: tape.run, source: tape.source, shift: geo.leadWidth };
}

/**
 * Та же дорожка, другой замер (догрузился шрифт, изменилось окно): пункт у левого края
 * остаётся на своём месте экрана.
 */
export function tapeRephase(before: TapeGeometry, offset: number, view: number, after: TapeGeometry): number {
  const loop = tapeLoop(after);
  if (!(loop > 0)) return 0;
  const slot = tapeWindow(before, offset, view)[0];
  const span = slot ? (slot.lead ? after.lead : after.spans)[slot.index] : undefined;
  if (!slot || !span) return mod(offset, loop);
  const left = slot.lead ? span.left : after.leadWidth + slot.copy * after.run + span.left;
  return mod(left - (slot.left - offset), loop);
}

/** Слепок ленты для сравнения: порядок, слова и тон — всё, что видно на экране. */
export function tapeKey(items: readonly TickerItem[]): string {
  return items.map((item) => `${item.id}\u0001${item.tone}\u0001${item.text}`).join("\u0002");
}
