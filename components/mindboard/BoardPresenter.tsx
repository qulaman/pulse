"use client";

import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState, type ReactNode } from "react";

import { Key, Lcd, LcdDim } from "@/components/ui/device/Device";
import { Rocker, RockerArrow, RockerWord, rockerKey } from "@/components/ui/device/Rocker";
import { haptic } from "@/lib/haptics";
import { boardOnWall } from "@/lib/mindboard/list";
import { stepPoint } from "@/lib/mindboard/tree";
import { useUpdateNote } from "@/lib/notes/mutations";
import { useIngestStore } from "@/lib/store/ingest";
import { useMe } from "@/lib/tasks/queries";
import { useTvBoardControl } from "@/lib/tv/mutations";
import {
  mapHint,
  pipsOf,
  presenterPill,
  presenterStage,
  presenterWords,
  type Pip,
  type PresenterPoint,
  type PresenterStage,
} from "@/lib/tv/presenter";
import { tvKeys, useTvState, type TvState } from "@/lib/tv/queries";
import { BOARD_VIEWS, boardPointOf, boardViewOf, type BoardView } from "@/lib/tv/state";

import p from "./presenter.module.css";

export type { PresenterPoint } from "@/lib/tv/presenter";

type Props = {
  boardId: string;
  /** Points of the top level with words, in the order of the board: the steps go through these. */
  points: PresenterPoint[];
  now: Date;
  /** Where it is drawn: the capsule over the board on the phone, or the block under the remote's display. */
  variant: "board" | "remote";
};

/** The scope `useTvBoardControl` runs its commands in (lib/tv/mutations.ts). */
const CONTROL_SCOPE = "tv-board-control";

/**
 * A presenter's command is on its way to the wall — the remote's lens blinks for it as for
 * any other command (D-76 §9): from the tap, not from the moment the wall row comes back.
 */
export function usePresenterBusy(): boolean {
  return useIsMutating({ predicate: (mutation) => mutation.options.scope?.id === CONTROL_SCOPE }) > 0;
}

/**
 * Ведущий (D-121): пока доска на стене, ◀ ▶ ведут совещание по пунктам — стена подсвечивает
 * обсуждаемый, остальные приглушает; «Отметить» гасит пункт с галочкой прямо со стены. Один
 * компонент в двух местах: капсулой над таб-баром на экране доски и блоком под дисплеем
 * пульта. Команда — `tv_board_control`, без очереди (D-76 §3): без сети — честное «нет связи».
 */
export function BoardPresenter({ boardId, points, now, variant }: Props) {
  return variant === "board" ? (
    <PresenterCapsule boardId={boardId} points={points} now={now} />
  ) : (
    <PresenterDeck boardId={boardId} points={points} now={now} />
  );
}

/** Where the meeting is and the three commands, shared by both places. */
function usePresenter(boardId: string, points: readonly PresenterPoint[], now: Date) {
  const queryClient = useQueryClient();
  const state = useTvState();
  const control = useTvBoardControl();
  const row = state.data ?? null;
  const stage = presenterStage(points, boardPointOf(row, now));
  // which way the last step went: the capsule slides the next point in from that side
  const [direction, setDirection] = useState<1 | -1>(1);

  const step = (to: 1 | -1) => {
    // the wall row as the cache holds it this instant, optimistic steps included: taps in a
    // row go on from the last one, never from a render that has not caught up yet
    const latest = queryClient.getQueryData<TvState | null>(tvKeys.state) ?? null;
    const next = stepPoint(
      points.map((point) => point.id),
      boardPointOf(latest, new Date()),
      to,
    );
    if (!next) return;
    setDirection(to);
    control.mutate({ point: next });
  };

  return {
    onWall: boardOnWall(row, boardId, now),
    stage,
    view: boardViewOf(row),
    direction,
    step,
    clear: () => control.mutate({ clearPoint: true }),
    setView: (view: BoardView) => control.mutate({ view }),
  };
}

/* -------------------------------------------------------------------------- */
/* On the remote: a block of the device under its display                     */
/* -------------------------------------------------------------------------- */

const VIEW_LABEL: Record<BoardView, string> = { list: "Список", map: "Карта" };

function PresenterDeck({ boardId, points, now }: { boardId: string; points: readonly PresenterPoint[]; now: Date }) {
  const presenter = usePresenter(boardId, points, now);
  const me = useMe();
  const update = useUpdateNote(me.data);
  if (!presenter.onWall) return null;

  const { stage, view } = presenter;
  const words = presenterWords(stage);
  const at = stage.kind === "point" ? stage.at : null;
  const pips = pipsOf(points, at);
  const done = stage.kind === "point" && stage.point.done;
  const hint = mapHint(points.length);

  const mark = () => {
    if (stage.kind !== "point") return;
    update.mutate({ id: stage.point.id, done_at: stage.point.done ? null : new Date().toISOString() });
  };

  return (
    <section className="mt-3" aria-label="Ведущий" data-testid="presenter-remote">
      {/* the presenter's own window: where the meeting is, the point, what comes next */}
      <Lcd className="!pb-3 !pt-2.5">
        <div className="flex h-4 items-center justify-between gap-3">
          <LcdDim className="min-w-0 truncate font-display text-[11px] font-semibold uppercase leading-4 tracking-[0.1em]">
            <span data-testid="presenter-step">{words.eyebrow}</span>
          </LcdDim>
          {pips ? <Pips pips={pips} /> : null}
        </div>
        <p
          className="mt-1.5 line-clamp-2 h-[44px] font-display text-[17px] font-semibold leading-[22px] tracking-[-0.01em] [overflow-wrap:anywhere]"
          style={done ? { opacity: 0.62 } : undefined}
          data-testid="presenter-point"
          aria-live="polite"
        >
          {done ? <DoneMark /> : null}
          {words.headline}
        </p>
        <LcdDim className="mt-1 block truncate text-[13px] leading-[18px]">
          <span data-testid="presenter-next">{words.line}</span>
        </LcdDim>
      </Lcd>

      {/* ◀ ✓ ▶: the D-pad the hand finds without looking */}
      <div className="mt-2.5">
        <Rocker label="Пункты доски">
          <Key
            className={rockerKey.back}
            icon={<RockerArrow to="back" />}
            aria-label="Предыдущий пункт"
            disabled={stage.kind !== "point" || stage.at === 0}
            data-testid="presenter-back"
            onClick={() => presenter.step(-1)}
          >
            <RockerWord>Назад</RockerWord>
          </Key>
          <Key
            className={rockerKey.ok}
            on={done}
            icon={<CheckIcon />}
            aria-label={done ? "Снять отметку с пункта" : "Отметить пункт"}
            disabled={stage.kind !== "point"}
            data-testid="presenter-mark"
            onClick={mark}
          >
            <RockerWord>{done ? "Отмечен" : "Отметить"}</RockerWord>
          </Key>
          <Key
            className={rockerKey.next}
            icon={<RockerArrow to="next" />}
            aria-label={stage.kind === "point" ? "Следующий пункт" : "Начать с первого пункта"}
            disabled={stage.kind === "empty" || (stage.kind === "point" && stage.next === null)}
            data-testid="presenter-next-key"
            onClick={() => presenter.step(1)}
          >
            <RockerWord>{stage.kind === "point" ? "Дальше" : "Начать"}</RockerWord>
          </Key>
        </Rocker>
      </div>

      {/* the spotlight off, and how the wall draws the board */}
      <div className="mt-2 grid grid-cols-[minmax(0,1.25fr)_minmax(0,2fr)] gap-2">
        <Key icon={<ClearIcon />} disabled={stage.kind !== "point"} data-testid="presenter-clear" onClick={presenter.clear}>
          <span className="px-1.5 leading-4">Снять подсветку</span>
        </Key>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Вид доски на стене">
          {BOARD_VIEWS.map((value) => (
            <Key
              key={value}
              on={view === value}
              role="radio"
              aria-checked={view === value}
              icon={value === "map" ? <MapIcon /> : <ListIcon />}
              data-testid={`presenter-view-${value}`}
              onClick={() => {
                if (view !== value) presenter.setView(value);
              }}
            >
              {VIEW_LABEL[value]}
            </Key>
          ))}
        </div>
      </div>
      {hint ? (
        <p className="mt-1.5 px-1 text-center text-[13px] leading-[18px] text-muted" data-testid="presenter-map-hint">
          {hint}
        </p>
      ) : null}
    </section>
  );
}

function Pips({ pips }: { pips: Pip[] }) {
  return (
    <span aria-hidden className={p.pips}>
      {pips.map((pip, index) => (
        <span key={index} className={`${p.pip} ${pip === "now" ? p.pipNow : pip === "done" ? p.pipDone : ""}`} />
      ))}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* On the board screen: a glass capsule over the tab bar                      */
/* -------------------------------------------------------------------------- */

/** The draft pill of the director's screens (DirectorFab) docks at the same place: the capsule stands on it. */
const DRAFT_PILL = 56;

function PresenterCapsule({ boardId, points, now }: { boardId: string; points: readonly PresenterPoint[]; now: Date }) {
  const presenter = usePresenter(boardId, points, now);
  const reduce = useReducedMotion();
  const draft = useIngestStore((state) => state.stage === "confirm");
  const shown = presenter.onWall && presenter.stage.kind !== "empty";
  const lift = reduce ? 0 : 14;

  return (
    <AnimatePresence>
      {shown ? (
        <motion.div
          key="presenter"
          className={`above-tabbar ${p.dock}`}
          style={{ bottom: `calc(var(--tabbar-space) + ${8 + (draft ? DRAFT_PILL : 0)}px)` }}
          initial={{ opacity: 0, y: lift }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: lift }}
          transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
        >
          <div className={p.capsule} role="group" aria-label="Ведущий" data-testid="presenter-board">
            {presenter.stage.kind === "empty" ? null : (
              <CapsuleBody stage={presenter.stage} presenter={presenter} reduce={reduce === true} />
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function CapsuleBody({
  stage,
  presenter,
  reduce,
}: {
  stage: Exclude<PresenterStage, { kind: "empty" }>;
  presenter: ReturnType<typeof usePresenter>;
  reduce: boolean;
}) {
  const pill = presenterPill(stage);
  const tick = () => haptic(10);

  if (pill.kind === "start") {
    return (
      <button
        type="button"
        className={p.start}
        data-testid="presenter-start"
        onPointerDown={tick}
        onClick={() => presenter.step(1)}
      >
        <span aria-hidden className={`${p.disc} ${p.discAccent}`}>
          <PlayGlyph />
        </span>
        <span className="min-w-0">
          <span className={p.startTitle}>{pill.title}</span>
          <span className={p.startLine}>{pill.line}</span>
        </span>
      </button>
    );
  }

  const point = stage.kind === "point" ? stage : null;
  const shift = reduce ? 0 : 10 * presenter.direction;

  return (
    <>
      <button
        type="button"
        className={p.disc}
        aria-label="Предыдущий пункт"
        disabled={point?.at === 0}
        data-testid="presenter-back"
        onPointerDown={tick}
        onClick={() => presenter.step(-1)}
      >
        <RockerArrow to="back" />
      </button>
      <button
        type="button"
        className={p.label}
        aria-label={`Пункт ${pill.step}: ${pill.text}${pill.done ? ", отмечен" : ""} — показать на доске`}
        data-testid="presenter-label"
        onClick={() => {
          // the card of the point on this screen, if it is drawn (components/mindboard/PointCard)
          const card = point ? document.querySelector(`[data-point-id="${point.point.id}"]`) : null;
          card?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={point?.point.id}
            className={p.labelText}
            initial={{ opacity: 0, x: shift }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -shift }}
            transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
          >
            <span className={p.step}>{pill.step}</span>
            <span className={`${p.pointText} ${pill.done ? p.pointDone : ""}`}>
              {pill.done ? <DoneMark /> : null}
              {pill.text}
            </span>
          </motion.span>
        </AnimatePresence>
      </button>
      <button
        type="button"
        className={`${p.disc} ${p.discAccent}`}
        aria-label="Следующий пункт"
        disabled={point?.next === null}
        data-testid="presenter-next-key"
        onPointerDown={tick}
        onClick={() => presenter.step(1)}
      >
        <RockerArrow to="next" />
      </button>
      <button type="button" className={p.clear} aria-label="Снять подсветку" data-testid="presenter-clear" onPointerDown={tick} onClick={presenter.clear}>
        снять
      </button>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Glyphs                                                                     */
/* -------------------------------------------------------------------------- */

const icon = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function Svg({ children }: { children: ReactNode }) {
  return <svg {...icon}>{children}</svg>;
}

const CheckIcon = () => (
  <Svg>
    <path d="M4.2 10.4l3.7 3.7 7.9-8.2" strokeWidth="2" />
  </Svg>
);

/** The spotlight off: the lamp of a point with a stroke through it. */
const ClearIcon = () => (
  <Svg>
    <circle cx="10" cy="10" r="6.4" />
    <path d="M5.4 14.6l9.2-9.2" />
  </Svg>
);

const ListIcon = () => (
  <Svg>
    <path d="M4.2 6h.01M4.2 10h.01M4.2 14h.01" strokeWidth="2.4" />
    <path d="M7.6 6h8.2M7.6 10h8.2M7.6 14h5.6" />
  </Svg>
);

/** A mind map: the title in the middle, branches to both sides. */
const MapIcon = () => (
  <Svg>
    <rect x="7" y="8.2" width="6" height="3.6" rx="1.4" />
    <path d="M7 10c-1.6 0-1.8-4-3.6-4M7 10c-1.6 0-1.8 4-3.6 4M13 10c1.6 0 1.8-4 3.6-4M13 10c1.6 0 1.8 4 3.6 4" />
  </Svg>
);

function PlayGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 22 22" aria-hidden>
      <path d="M7.6 4.6c0-.9 1-1.4 1.7-.9l7.4 5.9c.6.5.6 1.4 0 1.9l-7.4 5.9c-.7.5-1.7 0-1.7-.9z" fill="currentColor" />
    </svg>
  );
}

/** The tick before a marked point, in the text's own colour. */
function DoneMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden className="mr-1.5 inline-block align-[-1px]">
      <path d="M4.2 10.4l3.7 3.7 7.9-8.2" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
