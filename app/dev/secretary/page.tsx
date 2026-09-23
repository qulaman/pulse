"use client";

import { useState } from "react";

import { SecretaryDesk } from "@/components/pulse/SecretaryDesk";
import { SecretaryMascot, type SecretaryAct } from "@/components/secretary/SecretaryMascot";
import { DESK_SCENES, SCENE_NAME, type Daypart, type DeskPhase, type DeskScene, type Urgency } from "@/lib/errands/scene";

type Cell = {
  caption: string;
  scene?: DeskScene | null;
  phase: DeskPhase;
  bare?: boolean;
  talking?: boolean;
  act?: SecretaryAct;
  urgency?: Urgency;
  queue?: number;
  daypart?: Daypart;
  cheer?: boolean;
};

const SECTIONS: { title: string; cells: Cell[] }[] = [
  {
    title: "Покой: стол и время суток",
    cells: [
      { caption: "Утро", phase: "rest", daypart: "morning" },
      { caption: "День", phase: "rest", daypart: "day" },
      { caption: "Вечер", phase: "rest", daypart: "evening" },
      { caption: "Ночь — дремлет", phase: "rest", daypart: "night" },
    ],
  },
  {
    title: "Сценки в покое",
    cells: (["sip", "headset", "stretch", "clock", "papers", "plant", "arrive", "thanks"] as SecretaryAct[]).map((act) => ({
      caption: { sip: "Глоток", headset: "Гарнитура", stretch: "Потянуться", clock: "Часы", papers: "Бумаги", plant: "Цветок", arrive: "Пришла утром", thanks: "Спасибо ♥", accept: "" }[act]!,
      phase: "rest" as const,
      act,
    })),
  },
  {
    title: "Просят: срочность и очередь",
    cells: [
      { caption: "Только что", scene: "coffee", phase: "asked", urgency: 0 },
      { caption: "Ждёт минуту · ещё 1", scene: "tea", phase: "asked", urgency: 1, queue: 1 },
      { caption: "Повторный пуш · ещё 2", scene: "guest", phase: "asked", urgency: 2, queue: 2 },
      { caption: "«Есть!» на «Принял»", scene: "coffee", phase: "doing", act: "accept" },
      { caption: "Вызови охрану!", scene: "security", phase: "asked", urgency: 2 },
    ],
  },
  {
    title: "В работе",
    cells: DESK_SCENES.map((scene) => ({ caption: SCENE_NAME[scene], scene, phase: "doing" as const })),
  },
  {
    title: "Готово: развязки",
    cells: [
      { caption: "Уносит кофе", scene: "coffee", phase: "done" },
      { caption: "Дверь за гостем", scene: "guest", phase: "done" },
      { caption: "Табличка убрана", scene: "dnd", phase: "done" },
      { caption: "Машина уехала", scene: "taxi", phase: "done" },
      { caption: "Быстро — конфетти", scene: "tea", phase: "done", cheer: true },
      { caption: "Шарики — говорит", phase: "rest", bare: true, talking: true },
    ],
  },
];

const DESKS: {
  caption: string;
  scene: DeskScene | null;
  phase: DeskPhase;
  urgency?: Urgency;
  attending?: boolean;
  away?: string;
  etaLeft?: number;
  asking?: boolean;
}[] = [
  { caption: "Печатает", scene: null, phase: "rest" },
  { caption: "Просьба ждёт", scene: "coffee", phase: "asked", urgency: 1 },
  { caption: "Варит кофе — стоя у машины", scene: "coffee", phase: "doing" },
  { caption: "Заваривает чай", scene: "tea", phase: "doing" },
  { caption: "Приглашает гостя", scene: "guest", phase: "doing" },
  { caption: "Печатает", scene: "print", phase: "doing" },
  { caption: "Вызывает машину", scene: "taxi", phase: "doing" },
  { caption: "Не беспокоить", scene: "dnd", phase: "doing" },
  { caption: "Несёт чашку", scene: "coffee", phase: "done" },
  { caption: "Смотрит на директора", scene: null, phase: "rest", attending: true },
  { caption: "Будет через 4 мин", scene: "tea", phase: "doing", etaLeft: 4 },
  { caption: "Секретарь спрашивает", scene: "coffee", phase: "doing", asking: true },
  { caption: "Тревога", scene: "security", phase: "asked", urgency: 2 },
  { caption: "Никого нет на месте", scene: null, phase: "rest", away: "2026-09-23T09:30:00Z" },
];

/** /dev/secretary — every scene of the secretary's face on one screen (dev only, D-87, D-97, D-103). */
export default function SecretarySandboxPage() {
  // «ушёл / вернулся»: a desk whose presence a button flips, to watch the walk out and in
  const [away, setAway] = useState<string | null>(null);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <h1 className="text-[24px] font-bold leading-[30px]">Маскот секретаря</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">Сцены по заявке директора, стол, сценки, развязки (D-87, D-97)</p>
      {SECTIONS.map((section) => (
        <section key={section.title} className="mt-6">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{section.title}</h2>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4" data-testid="secretary-sandbox">
            {section.cells.map((cell) => (
              <figure
                key={cell.caption}
                className="flex flex-col items-center gap-2 overflow-hidden rounded-[20px] border border-border bg-surface/40 px-2 pb-3 pt-12"
                data-cell={`${cell.scene ?? "none"}-${cell.phase}`}
              >
                <div className="flex h-[124px] w-full items-center justify-center">
                  <SecretaryMascot
                    scene={cell.scene ?? null}
                    phase={cell.phase}
                    bare={cell.bare}
                    talking={cell.talking}
                    act={cell.act ?? null}
                    urgency={cell.urgency}
                    queue={cell.queue}
                    daypart={cell.daypart}
                    cheer={cell.cheer}
                    size={96}
                  />
                </div>
                <figcaption className="text-center text-[13px] leading-4 text-muted">{cell.caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
      <section className="mt-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Ушёл / вернулся</h2>
        <div className="mt-2 flex items-center gap-4 rounded-[20px] border border-border bg-surface/40 px-6 pb-8 pt-8" data-testid="desk-away-demo">
          <div className="flex h-[96px] items-center justify-center pl-10">
            <SecretaryDesk attending={false} count={0} tone="var(--ok)" label="Ушёл / вернулся" away={away} onTap={() => undefined} />
          </div>
          <button
            type="button"
            data-testid="toggle-away"
            className="min-h-[44px] rounded-full border border-border px-4 text-[14px] font-semibold"
            onClick={() => setAway((v) => (v ? null : new Date(Date.now() + 30 * 60_000).toISOString()))}
          >
            {away ? "Вернулся" : "Ушёл"}
          </button>
        </div>
      </section>
      <section className="mt-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Стол секретаря у директора</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {DESKS.map((desk) => (
            <figure key={desk.caption} className="flex flex-col items-center gap-2 rounded-[20px] border border-border bg-surface/40 px-2 pb-3 pt-8">
              <div className="flex h-[96px] items-center justify-center pl-10">
                <SecretaryDesk
                  attending={desk.attending === true}
                  count={desk.phase === "asked" || desk.phase === "doing" ? 1 : 0}
                  tone={desk.phase === "doing" ? "var(--ok)" : "var(--warn)"}
                  label={desk.caption}
                  scene={desk.scene}
                  phase={desk.phase}
                  urgency={desk.urgency}
                  away={desk.away ?? null}
                  etaLeft={desk.etaLeft ?? null}
                  asking={desk.asking}
                  onTap={() => undefined}
                />
              </div>
              <figcaption className="text-center text-[13px] leading-4 text-muted">{desk.caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}
