"use client";

import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { usePresenter, VIEW_LABEL } from "@/components/mindboard/BoardPresenter";
import { Button } from "@/components/ui/Button";
import { useUpdateNote } from "@/lib/notes/mutations";
import { useMe } from "@/lib/tasks/queries";
import { mapHint, nextOpen, presenterWords, type PresenterPoint } from "@/lib/tv/presenter";
import { BOARD_VIEWS } from "@/lib/tv/state";

/**
 * The presenter of the board on the wall (D-121) on the desk's remote (D-153): the same commands
 * as the phone's — ◀, «Отметить» (the point is ticked and the light goes on to the next open one,
 * D-140), ▶, the spotlight off, «Список / Карта» — as plain desk controls instead of the device's
 * rocker. Shown only while the director's board is on the wall.
 */
export function DeskPresenter({ boardId, points, now }: { boardId: string; points: PresenterPoint[]; now: Date }) {
  const presenter = usePresenter(boardId, points, now);
  const me = useMe();
  const update = useUpdateNote(me.data);
  if (!presenter.onWall) return null;

  const { stage, view } = presenter;
  const words = presenterWords(stage);
  const done = stage.kind === "point" && stage.point.done;
  const hint = mapHint(points.length);

  const mark = () => {
    if (stage.kind !== "point") return;
    const ticking = !stage.point.done;
    update.mutate({ id: stage.point.id, done_at: ticking ? new Date().toISOString() : null });
    if (ticking) presenter.goTo(nextOpen(points, stage.point.id));
  };

  return (
    <section aria-label="Ведущий" className="mt-2 rounded-[10px] border border-border px-3 py-2.5" data-testid="desk-presenter">
      <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-muted" data-testid="presenter-step">
        {words.eyebrow}
      </p>
      <p className="mt-1 line-clamp-2 text-[14px] font-semibold leading-5" style={done ? { opacity: 0.62 } : undefined} aria-live="polite">
        {done ? "✓ " : null}
        {words.headline}
      </p>
      {words.line ? <p className="truncate text-[12px] leading-4 text-muted">{words.line}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" aria-label="Предыдущий пункт" disabled={stage.kind !== "point" || stage.at === 0} onClick={() => presenter.step(-1)}>
          ◀ Назад
        </Button>
        <Button
          size="sm"
          variant={done ? "secondary" : "primary"}
          aria-label={done ? "Снять отметку с пункта" : "Отметить пункт и перейти к следующему"}
          disabled={stage.kind !== "point"}
          onClick={mark}
        >
          {done ? "Отмечен" : "Отметить"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          aria-label={stage.kind === "point" ? "Следующий пункт" : "Начать с первого пункта"}
          disabled={stage.kind === "empty" || (stage.kind === "point" && stage.next === null)}
          onClick={() => presenter.step(1)}
        >
          {stage.kind === "point" ? "Дальше ▶" : "Начать ▶"}
        </Button>
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
