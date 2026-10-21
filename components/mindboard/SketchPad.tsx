"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

import { NoteIcon } from "@/components/notes/icons";
import { toast } from "@/components/ui/Toast";
import { haptic } from "@/lib/haptics";
import {
  INK_LABEL,
  INK_VAR,
  INKS,
  SKETCH_H,
  SKETCH_W,
  simplify,
  strokePath,
  WEIGHT_WIDTH,
  withStroke,
  type Ink,
  type Sketch,
  type Weight,
} from "@/lib/mindboard/sketch";

type Props = {
  /** The drawing to go on with («Дорисовать»); null — a new one. */
  initial: Sketch | null;
  /** The words of the point, if it has them: they stay with the drawing. */
  caption: string;
  /** «На доску» / «Сохранить»: the drawing (null — rubbed out) and the words under it. */
  onSave: (sketch: Sketch | null, caption: string) => void;
  onClose: () => void;
  /** Editing a point already on the board: the key says «Сохранить». */
  editing: boolean;
};

/** A finger moves a pixel at a time: a point is kept when it has gone this far on the grid. */
const STEP = 3;

/** The CSS values of the inks, for the canvas (SVG takes the variables themselves): read once a pad. */
function inkColors(): Record<Ink, string> {
  const style = getComputedStyle(document.documentElement);
  const of = (ink: Ink) => style.getPropertyValue(INK_VAR[ink].slice(4, -1)).trim() || "#fff";
  return { text: of("text"), accent: of("accent"), warn: of("warn") };
}

/**
 * The pad of «Рисунок» (D-141): a 16:9 sheet — the shape of the wall — over the whole screen,
 * drawn with a finger: three inks, a pen and a marker, «Отменить», «Стереть»; the words of the
 * point on top, if wanted; «На доску» puts the drawing on the board as a point. Drawn before
 * the meeting, not during it: nothing goes to the wall until it is saved. Turned sideways the
 * sheet is as large as the phone. The canvas draws the line under the finger; when the finger
 * lifts, the line is thinned (`simplify`) and redrawn with the same smoothed path the card and
 * the wall draw, so what is seen here is what will be seen there.
 */
export function SketchPad({ initial, caption: initialCaption, onSave, onClose, editing }: Props) {
  const [sketch, setSketch] = useState<Sketch | null>(initial);
  const [past, setPast] = useState<(Sketch | null)[]>([]);
  const [ink, setInk] = useState<Ink>("text");
  const [weight, setWeight] = useState<Weight>(1);
  const [caption, setCaption] = useState(initialCaption);
  const [armed, setArmed] = useState(false);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const room = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{ id: number; points: number[] } | null>(null);
  const colors = useRef<Record<Ink, string> | null>(null);
  const inkColor = useCallback((value: Ink) => (colors.current ??= inkColors())[value], []);
  // the drawing as it stands, for a redraw after a resize
  const current = useRef(sketch);
  useEffect(() => {
    current.current = sketch;
  });
  const dirty = past.length > 0 || caption.trim() !== initialCaption.trim();

  // the sheet: as large as the room allows at 16:9
  useLayoutEffect(() => {
    const node = room.current;
    if (!node) return;
    const fit = () => {
      const width = Math.min(node.clientWidth, (node.clientHeight * 16) / 9);
      setBox({ width: Math.floor(width), height: Math.floor((width * 9) / 16) });
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(node);
    return () => resize.disconnect();
  }, []);

  // nothing under the pad scrolls while it is open
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  // «Отмена» with unsaved lines asks once more, for three seconds
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3_000);
    return () => clearTimeout(timer);
  }, [armed]);

  const context = useCallback(() => {
    const node = canvas.current;
    const ctx = node?.getContext("2d");
    if (!node || !ctx) return null;
    const scale = node.width / SKETCH_W;
    // grid units in, device pixels out
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return ctx;
  }, []);

  // the whole drawing again: after a line is finished, «Отменить», «Стереть», a resize
  const redraw = useCallback(
    (next: Sketch | null) => {
      const ctx = context();
      if (!ctx) return;
      ctx.clearRect(0, 0, SKETCH_W, SKETCH_H);
      for (const stroke of next?.strokes ?? []) {
        ctx.strokeStyle = inkColor(stroke.c);
        ctx.lineWidth = WEIGHT_WIDTH[stroke.w];
        ctx.stroke(new Path2D(strokePath(stroke)));
      }
    },
    [context, inkColor],
  );

  // the canvas in device pixels for the sheet's size
  useLayoutEffect(() => {
    const node = canvas.current;
    if (!node || box.width === 0) return;
    const ratio = window.devicePixelRatio || 1;
    node.width = Math.round(box.width * ratio);
    node.height = Math.round(box.height * ratio);
    redraw(current.current);
  }, [box, redraw]);

  // a finger that slides off the sheet stays on its edge: what is drawn here is what is saved
  const toGrid = (event: { clientX: number; clientY: number }): [number, number] => {
    const rect = (canvas.current as HTMLCanvasElement).getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * SKETCH_W;
    const y = ((event.clientY - rect.top) / rect.height) * SKETCH_H;
    return [Math.min(SKETCH_W, Math.max(0, x)), Math.min(SKETCH_H, Math.max(0, y))];
  };

  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    // one finger draws; a second one (a palm, a pinch) is ignored
    if (drawing.current) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const [x, y] = toGrid(event);
    drawing.current = { id: event.pointerId, points: [x, y] };
    const ctx = context();
    if (!ctx) return;
    ctx.strokeStyle = inkColor(ink);
    ctx.lineWidth = WEIGHT_WIDTH[weight];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y);
    ctx.stroke();
  };

  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const line = drawing.current;
    if (!line || line.id !== event.pointerId) return;
    const ctx = context();
    if (!ctx) return;
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    ctx.strokeStyle = inkColor(ink);
    ctx.lineWidth = WEIGHT_WIDTH[weight];
    for (const each of events) {
      const [x, y] = toGrid(each);
      const lx = line.points[line.points.length - 2];
      const ly = line.points[line.points.length - 1];
      if (Math.hypot(x - lx, y - ly) < STEP) continue;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(x, y);
      ctx.stroke();
      line.points.push(x, y);
    }
  };

  const end = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const line = drawing.current;
    if (!line || line.id !== event.pointerId) return;
    drawing.current = null;
    const next = withStroke(sketch, { c: ink, w: weight, p: simplify(line.points) });
    if (!next) {
      toast("Рисунок заполнен — сохраните его или сотрите лишнее");
      redraw(sketch);
      return;
    }
    setPast((was) => [...was, sketch]);
    setSketch(next);
    // the line as the card and the wall will draw it: thinned and smoothed
    redraw(next);
  };

  const undo = () => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((was) => was.slice(0, -1));
    setSketch(previous);
    redraw(previous);
    haptic(8);
  };

  const wipe = () => {
    if (!sketch) return;
    setPast((was) => [...was, sketch]);
    setSketch(null);
    redraw(null);
    haptic(10);
  };

  const close = () => {
    if (dirty && !armed) {
      setArmed(true);
      return;
    }
    onClose();
  };

  const save = () => {
    haptic([8, 30, 12]);
    onSave(sketch, caption.trim());
  };

  const empty = !sketch && caption.trim() === "";

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-bg"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Рисунок"
      data-testid="sketch-pad"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={close}
          data-testid="sketch-cancel"
          className={`min-h-[44px] shrink-0 rounded-[12px] px-3 text-[15px] font-semibold transition-colors duration-[120ms] active:bg-white/[0.06] ${armed ? "text-warn" : "text-muted"}`}
        >
          {armed ? "Не сохранять?" : "Отмена"}
        </button>
        <input
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={200}
          enterKeyHint="done"
          placeholder="Подпись — по желанию"
          aria-label="Подпись к рисунку"
          data-testid="sketch-caption"
          className="field min-h-[40px] min-w-0 flex-1 rounded-[12px] px-3 text-[15px] outline-none placeholder:text-muted"
        />
        <button
          type="button"
          onClick={save}
          // nothing and no words is no point: a drawn point is rubbed out by «Удалить» on its card
          disabled={empty}
          data-testid="sketch-save"
          className="btn-primary min-h-[44px] shrink-0 rounded-[14px] px-4 text-[15px] font-semibold text-bg transition-[transform,opacity] duration-[120ms] active:scale-[0.97] disabled:opacity-40"
        >
          {editing ? "Сохранить" : "На доску"}
        </button>
      </div>

      {/* sideways the tools stand beside the sheet: it gets the whole height of the phone */}
      <div className="flex min-h-0 flex-1 flex-col landscape:flex-row">
        <div ref={room} className="flex min-h-0 min-w-0 flex-1 items-center justify-center px-3 landscape:pb-2">
          <div
            className="relative overflow-hidden rounded-[14px] bg-surface"
            style={{ width: box.width, height: box.height, boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--border) 90%, transparent)" }}
          >
            <canvas
              ref={canvas}
              className="absolute inset-0 h-full w-full"
              style={{ touchAction: "none" }}
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onContextMenu={(event) => event.preventDefault()}
              data-testid="sketch-canvas"
            />
            {!sketch ? (
              <p aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-[14px] leading-[19px] text-muted">
                Рисуйте пальцем — так это увидят на стене. Поверните телефон, и лист станет больше
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-2.5 landscape:flex-col landscape:justify-center landscape:gap-1 landscape:px-2 landscape:py-1" data-testid="sketch-tools">
          {INKS.map((value) => (
            <button
              key={value}
              type="button"
              aria-label={INK_LABEL[value]}
              aria-pressed={ink === value}
              onClick={() => setInk(value)}
              data-testid={`sketch-ink-${value}`}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-transform duration-[120ms] active:scale-[0.92] ${ink === value ? "border-text" : "border-transparent"}`}
            >
              <span aria-hidden className="h-7 w-7 rounded-full" style={{ background: INK_VAR[value] }} />
            </button>
          ))}
          <span aria-hidden className="mx-1 h-7 w-px shrink-0 bg-border landscape:mx-0 landscape:my-0.5 landscape:h-px landscape:w-7" />
          {([1, 2] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-label={value === 1 ? "Ручка" : "Маркер"}
              aria-pressed={weight === value}
              onClick={() => setWeight(value)}
              data-testid={`sketch-weight-${value}`}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-[120ms] ${weight === value ? "bg-surface-2" : ""}`}
            >
              <span aria-hidden className="rounded-full bg-text" style={{ width: value === 1 ? 6 : 14, height: value === 1 ? 6 : 14 }} />
            </button>
          ))}
          <span className="ml-auto flex items-center gap-1 landscape:ml-0 landscape:flex-col">
            <button
              type="button"
              onClick={undo}
              disabled={past.length === 0}
              aria-label="Отменить последнюю линию"
              title="Отменить"
              data-testid="sketch-undo"
              className="flex h-11 w-11 items-center justify-center rounded-full text-text transition-colors duration-[120ms] active:bg-white/[0.06] disabled:opacity-35"
            >
              <NoteIcon name="restore" size={20} />
            </button>
            <button
              type="button"
              onClick={wipe}
              disabled={!sketch}
              aria-label="Стереть рисунок"
              title="Стереть"
              data-testid="sketch-wipe"
              className="flex h-11 w-11 items-center justify-center rounded-full text-danger/85 transition-colors duration-[120ms] active:bg-white/[0.06] disabled:opacity-35"
            >
              <NoteIcon name="trash" size={20} />
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
