"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";

import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { usePresenter, VIEW_LABEL } from "@/components/mindboard/BoardPresenter";
import { Button } from "@/components/ui/Button";
import { isTypingTarget } from "@/lib/desk/keys";
import { useUpdateNote } from "@/lib/notes/mutations";
import { useMe } from "@/lib/tasks/queries";
import { mapHint, nextOpen, presenterWords, type PresenterPoint } from "@/lib/tv/presenter";
import { BOARD_VIEWS } from "@/lib/tv/state";

/**
 * The presenter of the board on the wall (D-121) on the desk's remote (D-153): the same commands
 * as the phone's — ◀, «Отметить» (the point is ticked and the light goes on to the next open one,
 * D-140), ▶, the spotlight off, «Список / Карта» — as plain desk controls instead of the device's
 * rocker, and keys: ←/→ (a presentation clicker's PageUp/PageDown too) — the previous and the next
 * point, Ctrl+Enter — tick it and go on. Shown only while the director's board is on the wall.
 */
export function DeskPresenter({ boardId, points, now }: { boardId: string; points: PresenterPoint[]; now: Date }) {
  const presenter = usePresenter(boardId, points, now);
  const me = useMe();
  const update = useUpdateNote(me.data);

  /** «Отметить»: the point is ticked and the light goes on to the next open one (D-140). */
  const mark = () => {
    const current = presenter.stage;
    if (current.kind !== "point") return;
    const ticking = !current.point.done;
    update.mutate({ id: current.point.id, done_at: ticking ? new Date().toISOString() : null });
    if (ticking) presenter.goTo(nextOpen(points, current.point.id));
  };

  // the keys lead the meeting while the board is up — never from a field being typed in
  const keys = useRef<(event: KeyboardEvent) => boolean>(() => false);
  useEffect(() => {
    keys.current = (event) => {
      if (!presenter.onWall || isTypingTarget(event.target) || event.altKey || event.shiftKey) return false;
      const back = event.code === "ArrowLeft" || event.code === "PageUp";
      const forward = event.code === "ArrowRight" || event.code === "PageDown";
      if ((back || forward) && !event.ctrlKey && !event.metaKey) {
        presenter.step(back ? -1 : 1);
        return true;
      }
      if ((event.ctrlKey || event.metaKey) && (event.code === "Enter" || event.code === "NumpadEnter") && presenter.stage.kind === "point") {
        mark();
        return true;
      }
      return false;
    };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (document.body.hasAttribute("data-sheet-open") || document.body.hasAttribute("data-dialog-open")) return;
      if (keys.current(event)) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useShortcuts(
    "Ведущий на стене",
    presenter.onWall
      ? [
          { keys: ["←", "→"], label: "Прошлый и следующий пункт" },
          { keys: ["PgUp", "PgDn"], label: "То же — кликером для презентаций" },
          { keys: ["Ctrl Enter"], label: "Отметить пункт и дальше" },
        ]
      : [],
  );

  if (!presenter.onWall) return null;

  const { stage, view } = presenter;
  const words = presenterWords(stage);
  const done = stage.kind === "point" && stage.point.done;
  const hint = mapHint(points.length);
  // how far the meeting has come: the point in the light of all of them
  const at = stage.kind === "point" ? stage.at + 1 : 0;

  return (
    <section aria-label="Ведущий" className="screen-presenter border-t border-border/60 py-2" data-testid="desk-presenter">
      <p className="desk-label uppercase" data-testid="presenter-step">
        {words.eyebrow}
      </p>
      {points.length > 0 ? (
        <span aria-hidden className="screen-presenter-steps" style={{ "--steps": points.length } as CSSProperties}>
          {points.map((point, index) => (
            <i key={point.id} data-done={point.done ? "" : undefined} data-here={index + 1 === at ? "" : undefined} />
          ))}
        </span>
      ) : null}
      <p className="mt-1 line-clamp-2 text-[14px] font-semibold leading-5" style={done ? { opacity: 0.62 } : undefined} aria-live="polite">
        {done ? "✓ " : null}
        {words.headline}
      </p>
      {words.line ? <p className="truncate text-[12px] leading-4 text-muted">{words.line}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Tooltip label="Предыдущий пункт" keys={["←"]}>
          <Button size="sm" variant="secondary" aria-label="Предыдущий пункт" icon={<ChevronLeft aria-hidden size={15} strokeWidth={2.2} />} disabled={stage.kind !== "point" || stage.at === 0} onClick={() => presenter.step(-1)}>
            Назад
          </Button>
        </Tooltip>
        <Tooltip label={done ? "Снять отметку" : "Отметить и дальше"} keys={["Ctrl", "Enter"]}>
          <Button
            size="sm"
            variant={done ? "secondary" : "primary"}
            aria-label={done ? "Снять отметку с пункта" : "Отметить пункт и перейти к следующему"}
            icon={<Check aria-hidden size={15} strokeWidth={2.4} />}
            disabled={stage.kind !== "point"}
            onClick={mark}
          >
            {done ? "Отмечен" : "Отметить"}
          </Button>
        </Tooltip>
        <Tooltip label={stage.kind === "point" ? "Следующий пункт" : "С первого пункта"} keys={["→"]}>
          <Button
            size="sm"
            variant="secondary"
            aria-label={stage.kind === "point" ? "Следующий пункт" : "Начать с первого пункта"}
            disabled={stage.kind === "empty" || (stage.kind === "point" && stage.next === null)}
            onClick={() => presenter.step(1)}
          >
            {stage.kind === "point" ? "Дальше" : "Начать"}
            <ChevronRight aria-hidden size={15} strokeWidth={2.2} className="-mr-1" />
          </Button>
        </Tooltip>
        <Button size="sm" variant="ghost" disabled={stage.kind !== "point"} onClick={presenter.clear}>
          Снять подсветку
        </Button>
        <SegmentTabs
          aria-label="Вид доски на стене"
          value={view}
          onChange={(next) => {
            if (next !== view) presenter.setView(next);
          }}
          items={BOARD_VIEWS.map((value) => ({ value, label: VIEW_LABEL[value] }))}
        />
      </div>
      {hint ? <p className="mt-1.5 text-[12px] leading-4 text-muted">{hint}</p> : null}
    </section>
  );
}
