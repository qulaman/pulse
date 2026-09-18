"use client";

import { Mascot } from "@/components/brand/Mascot";
import { focusRows, type FocusTone } from "@/lib/tv/focus";
import type { TvFocusEmployee, TvState } from "@/lib/tv/queries";
import { focusRemainingMs } from "@/lib/tv/state";

import { useVhPx } from "./useKiosk";

/**
 * Сотрудник на стене: директор нажал в телефоне — в коридоре его дела (D-76 §10).
 * Лицо уходит в угол и уменьшается, место занимает человек и то, что на нём висит.
 *
 * Чего здесь нет и не будет: слова «просрочено», красного цвета, отказов и
 * доработок отдельным словом. Негатив по именам на экран в кабинете не выносится
 * (D-45) — срок печатается датой, и всё. Правило живёт в lib/tv/focus.ts, здесь
 * только цвет по уже посчитанному тону.
 */

const FACE_VH = 12;
/** Больше шести строк с двух метров уже не читаются — остальное живёт в телефоне. */
const ROWS = 6;

const TONE: Record<FocusTone, string> = {
  accent: "var(--accent)",
  ok: "var(--ok)",
  muted: "var(--text-muted)",
};

export function TvFocus({ focus, state, now }: { focus: TvFocusEmployee; state: TvState | null; now: Date }) {
  const size = useVhPx(FACE_VH);
  const rows = focusRows(focus, now).slice(0, ROWS);
  const minutes = Math.ceil(focusRemainingMs(state, now) / 60_000);

  return (
    <div className="flex w-full max-w-[86vw] flex-col gap-[3vh]">
      <div className="flex items-center gap-[3vh]">
        <span className="shrink-0" style={{ width: size, height: size }}>
          {size > 0 ? <Mascot state="speaking" size={size} /> : null}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[7vh] font-bold leading-[8vh]">{focus.employee.name}</p>
          {focus.employee.position ? (
            <p className="truncate text-[3vh] leading-[4vh] text-muted">{focus.employee.position}</p>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-[3.6vh] leading-[5.4vh] text-muted">Свободен: открытых дел нет</p>
      ) : (
        <ul className="flex flex-col gap-[1.6vh]">
          {rows.map((row) => (
            <li key={row.id} className="flex items-baseline gap-[2vh]">
              <span className="min-w-0 flex-1 truncate text-[3.6vh] leading-[5vh]">{row.title}</span>
              <span
                className="shrink-0 text-[2.4vh] font-semibold leading-[3.2vh]"
                style={{ color: TONE[row.tone] }}
              >
                {row.status}
              </span>
              {row.deadline ? (
                <span className="shrink-0 text-[2.4vh] leading-[3.2vh] text-muted">{row.deadline}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {minutes > 0 ? (
        <p className="text-[2vh] leading-[2.6vh] text-muted">на экране ещё {minutes} мин</p>
      ) : null}
    </div>
  );
}
