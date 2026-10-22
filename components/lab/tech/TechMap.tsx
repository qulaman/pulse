"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { MiniCard, type Mark, type MarkTone } from "@/components/lab/pitch/parts";

import { CodeLine, hang } from "./CodeLine";
import { NODES, SCRIPTS, type Lane, type NodeKey, type Panel, type Step, type Tone } from "./script";
import styles from "./tech.module.css";

/**
 * The system map of «Технология»: three lanes — the director's phone, the cloud, the
 * employee's phone — with a node per piece of the pipeline. A packet of light carries one
 * phrase from node to node, the trail stays lit in the colour of each visit, and the inspector
 * beside the map quotes what passes through the current node. A scripted replay: it runs while
 * on screen, loops, pauses, and any step or node can be tapped.
 */

const COLOR: Record<Tone | MarkTone, string> = {
  accent: "var(--accent)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  muted: "var(--text-muted)",
};

// the cloud lane is wider: most of the work happens there
const LANE_WEIGHT: Record<Lane, number> = { director: 1, cloud: 1.4, employee: 1 };
const LANES: Lane[] = ["director", "cloud", "employee"];
const WEIGHT = LANES.reduce((sum, lane) => sum + LANE_WEIGHT[lane], 0);
const LANE_X = LANES.reduce(
  (acc, lane, i) => {
    const before = LANES.slice(0, i).reduce((sum, l) => sum + LANE_WEIGHT[l], 0);
    acc[lane] = ((before + LANE_WEIGHT[lane] / 2) / WEIGHT) * 100;
    return acc;
  },
  {} as Record<Lane, number>,
);
const LANE_LABEL: Record<Lane, string> = { director: "Директор", cloud: "Облако", employee: "Сотрудник" };
const ROWS = NODES.length;
const GRID_COLUMNS = LANES.map((lane) => `${LANE_WEIGHT[lane]}fr`).join(" ");

/** A node's centre in percent of the map. */
function centre(key: NodeKey): { x: number; y: number } {
  const row = NODES.findIndex((n) => n.key === key);
  return { x: LANE_X[NODES[row].lane], y: ((row + 0.5) / ROWS) * 100 };
}

/** The way between two nodes: down to the row boundary, across the lanes, down again. */
function elbow(from: NodeKey, to: NodeKey): { d: string; xs: number[]; ys: number[] } {
  const a = centre(from);
  const b = centre(to);
  const mid = (a.y + b.y) / 2;
  return { d: `M ${a.x} ${a.y} V ${mid} H ${b.x} V ${b.y}`, xs: [a.x, a.x, b.x, b.x], ys: [a.y, mid, mid, b.y] };
}

// the pause at the end of a script before it starts over
const REST = 2800;
// the packet's flight; the inspector's lines start once it lands
const FLIGHT = 0.75;
const FIRST_LINE = 420;
const LINE_GAP = 70;

/** A timeout that, stopped before it fired, tells how much of it was left (null once it fired). */
function countdown(ms: number, done: () => void): () => number | null {
  const started = performance.now();
  let fired = false;
  const id = window.setTimeout(() => {
    fired = true;
    done();
  }, ms);
  return () => {
    window.clearTimeout(id);
    return fired ? null : Math.max(0, ms - (performance.now() - started));
  };
}

/** The last word a step said about the recording or the receipt, up to the current step. */
function carried(steps: Step[], index: number, field: "audio" | "receipt"): Mark | null {
  for (let i = index; i >= 0; i--) {
    const mark = steps[i][field];
    if (mark) return mark;
  }
  return null;
}

export function TechMap() {
  const [scriptKey, setScriptKey] = useState(SCRIPTS[0].key);
  const [index, setIndex] = useState(0);
  const [resting, setResting] = useState(false);
  const [paused, setPaused] = useState(false);
  // a jump or a restart starts its step from zero even when it lands on the same step
  const [epoch, setEpoch] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { amount: 0.25 });
  const still = useReducedMotion() ?? false;
  const running = inView && !paused;

  const script = SCRIPTS.find((s) => s.key === scriptKey) ?? SCRIPTS[0];
  const steps = script.steps;
  const step = steps[index];
  const stepMs = resting ? REST : step.ms;
  const stepKey = `${script.key}:${index}:${resting ? "rest" : "step"}:${epoch}`;
  // what was left of a step when the story stopped (paused, or scrolled away)
  const left = useRef<{ key: string; ms: number } | null>(null);

  useEffect(() => {
    if (!running) return;
    const stop = countdown(left.current?.key === stepKey ? left.current.ms : stepMs, () => {
      if (resting) {
        setResting(false);
        setIndex(0);
      } else if (index >= steps.length - 1) setResting(true);
      else setIndex(index + 1);
    });
    return () => {
      const rest = stop();
      left.current = rest === null ? null : { key: stepKey, ms: rest };
    };
  }, [running, stepKey, stepMs, resting, index, steps.length]);

  const jump = (i: number) => {
    setIndex(i);
    setResting(false);
    setEpoch((e) => e + 1);
  };
  const pick = (key: string) => {
    setScriptKey(key);
    setIndex(0);
    setResting(false);
    setEpoch((e) => e + 1);
    setPaused(false);
  };
  const restart = () => {
    setIndex(0);
    setResting(false);
    setEpoch((e) => e + 1);
    setPaused(false);
  };

  // every node's latest visit up to now: its colour, and whether it is the current one
  const visits = new Map<NodeKey, Tone>();
  for (let i = 0; i <= index; i++) visits.set(steps[i].node, steps[i].tone ?? "accent");
  const tone = step.tone ?? "accent";
  const from = index > 0 ? steps[index - 1].node : step.node;
  const flight = elbow(from, step.node);
  const flies = from !== step.node && !resting;

  return (
    <div ref={box} className={`card overflow-hidden p-4 md:p-6 ${styles.root}`} data-paused={running ? undefined : ""}>
      {/* the scenarios: one scrolling row on a phone, wrapped from md up */}
      <div
        role="radiogroup"
        aria-label="Сценарий"
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
      >
          {SCRIPTS.map((s) => {
            const on = s.key === script.key;
            return (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pick(s.key)}
                className={`h-9 shrink-0 rounded-full border px-3 text-[14px] font-medium leading-[18px] transition-colors ${
                  on ? "border-accent/50 bg-accent/15 text-text" : "border-border bg-surface-2 text-muted"
                }`}
              >
                {s.label}
              </button>
            );
          })}
      </div>

      <div className="mt-3 flex items-start gap-3">
        <p className="min-w-0 flex-1 text-[15px] leading-[22px] text-muted">{script.summary}</p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="btn-secondary grid size-11 place-items-center rounded-[12px]"
            aria-label={paused ? "Продолжить" : "Пауза"}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden fill="currentColor">
              {paused ? <path d="M7 4.5v15l12-7.5z" /> : <path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" />}
            </svg>
          </button>
          <button type="button" onClick={restart} className="btn-secondary grid size-11 place-items-center rounded-[12px]" aria-label="Сначала">
            <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4.5v4.5h4.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* the steps: done segments full, the current one filling over its own time */}
      <div className="mt-3 flex gap-1">
        {steps.map((s, i) => (
          <button key={i} type="button" onClick={() => jump(i)} className="flex-1 py-2" aria-label={`Шаг ${i + 1}: ${s.title}`}>
            <span className="block h-[3px] w-full overflow-hidden rounded-full bg-border">
              {i < index || resting ? (
                <span className="block h-full w-full rounded-full" style={{ background: COLOR[s.tone ?? "accent"] }} />
              ) : i === index ? (
                <span
                  key={stepKey}
                  className={`block h-full w-full rounded-full ${styles.fill}`}
                  style={{ background: COLOR[tone], animationDuration: `${s.ms}ms` }}
                />
              ) : null}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-8">
        <div>
          <div className="grid grid-cols-2 gap-2">
            <StripMark label="Голосовое" mark={carried(steps, index, "audio")} />
            <StripMark label="Квитанция" mark={carried(steps, index, "receipt")} />
          </div>

          <div className="mt-3 grid text-center" style={{ gridTemplateColumns: GRID_COLUMNS }}>
            {LANES.map((lane) => (
              <p key={lane} className="eyebrow truncate px-1 text-[11px]">
                {LANE_LABEL[lane]}
              </p>
            ))}
          </div>

          <div className="relative mt-2 h-[432px] md:h-[504px] lg:h-[552px]">
            {/* the lanes: two phones at the edges, the cloud between them */}
            <div aria-hidden className="absolute inset-0 grid" style={{ gridTemplateColumns: GRID_COLUMNS }}>
              {LANES.map((lane) => (
                <div
                  key={lane}
                  className={`mx-0.5 rounded-[14px] ${lane === "cloud" ? "" : "border border-dashed border-border"}`}
                  style={lane === "cloud" ? { background: "color-mix(in srgb, var(--surface-2) 55%, transparent)" } : undefined}
                />
              ))}
            </div>

            <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              {NODES.slice(1).map((node, i) => (
                <path
                  key={node.key}
                  d={elbow(NODES[i].key, node.key).d}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {steps.slice(1, index + 1).map((s, i) => {
                if (steps[i].node === s.node) return null;
                const fresh = i + 1 === index && !resting;
                return (
                  <motion.path
                    key={`${stepKey}-${i}`}
                    d={elbow(steps[i].node, s.node).d}
                    fill="none"
                    stroke={COLOR[s.tone ?? "accent"]}
                    strokeWidth={2.2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    initial={{ opacity: fresh && !still ? 0 : 0.85 }}
                    animate={{ opacity: 0.85 }}
                    transition={{ duration: FLIGHT, ease: "easeOut" }}
                  />
                );
              })}
            </svg>

            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: GRID_COLUMNS, gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))` }}>
              {NODES.map((node, row) => {
                const visit = visits.get(node.key);
                const active = node.key === step.node && !resting;
                const first = steps.findIndex((s) => s.node === node.key);
                return (
                  <MapNode
                    key={node.key}
                    title={node.title}
                    tech={node.tech}
                    row={row}
                    column={LANES.indexOf(node.lane)}
                    tone={active ? tone : visit}
                    active={active}
                    onPick={first >= 0 ? () => jump(first) : undefined}
                  />
                );
              })}
            </div>

            {/* the packet fades as it lands, so the node's name stays readable */}
            {flies && !still ? (
              <motion.div
                key={`${script.key}:${index}:${epoch}`}
                aria-hidden
                className={styles.packet}
                style={{ "--glow": COLOR[tone] } as CSSProperties}
                initial={{ left: `${flight.xs[0]}%`, top: `${flight.ys[0]}%`, opacity: 1 }}
                animate={{ left: flight.xs.map((x) => `${x}%`), top: flight.ys.map((y) => `${y}%`), opacity: [1, 1, 1, 0] }}
                transition={{ duration: FLIGHT, times: [0, 0.3, 0.7, 1], ease: "easeInOut" }}
              />
            ) : null}
          </div>
        </div>

        <Inspector key={`${script.key}:${index}:${epoch}`} step={step} index={index} total={steps.length} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The map's pieces                                                            */
/* -------------------------------------------------------------------------- */

function StripMark({ label, mark }: { label: string; mark: Mark | null }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface-2 px-3 py-2">
      <p className="eyebrow text-[11px]">{label}</p>
      <p className="mt-0.5 flex h-5 items-center gap-1.5 text-[14px] font-medium leading-5">
        {mark ? (
          <motion.span
            key={mark.text}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
            className="flex min-w-0 items-center gap-1.5"
            style={{ color: COLOR[mark.tone] }}
          >
            <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: COLOR[mark.tone] }} />
            <span className="truncate">{mark.text}</span>
          </motion.span>
        ) : null}
      </p>
    </div>
  );
}

function MapNode({
  title,
  tech,
  row,
  column,
  tone,
  active,
  onPick,
}: {
  title: string;
  tech: string;
  row: number;
  column: number;
  /** the colour of the latest visit; none — not visited yet in this script */
  tone: Tone | undefined;
  active: boolean;
  onPick?: () => void;
}) {
  const color = tone ? COLOR[tone] : null;
  const look = (color
    ? {
        borderColor: active ? color : `color-mix(in srgb, ${color} 50%, var(--border))`,
        background: `color-mix(in srgb, ${color} ${active ? 18 : 8}%, var(--surface))`,
        boxShadow: active ? `0 0 18px color-mix(in srgb, ${color} 30%, transparent)` : undefined,
        ["--ring" as string]: color,
      }
    : { borderColor: "color-mix(in srgb, var(--border) 70%, transparent)", background: "var(--surface)" }) as CSSProperties;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!onPick}
      aria-current={active ? "step" : undefined}
      aria-label={`${title} — ${tech}`}
      className="relative z-[1] mx-1 flex h-7 flex-col items-center justify-center self-center rounded-[10px] border px-1.5 transition-[background-color,border-color] duration-300 md:h-[34px] lg:h-[38px]"
      style={{ gridRow: row + 1, gridColumn: column + 1, ...look }}
    >
      {active ? <span aria-hidden className={styles.ring} /> : null}
      <span className={`block w-full truncate text-[12px] font-semibold leading-[14px] ${color ? "text-text" : "text-muted opacity-70"}`}>{title}</span>
      <span className={`hidden w-full truncate font-mono text-[9.5px] leading-3 text-muted md:block ${color ? "" : "opacity-60"}`}>{tech}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* The inspector                                                               */
/* -------------------------------------------------------------------------- */

function linesOf(panel: Panel): number {
  switch (panel.type) {
    case "code":
      return panel.lines.length;
    case "checks":
    case "turns":
    case "cards":
      return panel.items.length;
    default:
      return 1;
  }
}

function Inspector({ step, index, total }: { step: Step; index: number; total: number }) {
  const node = NODES.find((n) => n.key === step.node) ?? NODES[0];
  const color = COLOR[step.tone ?? "accent"];
  // the panels' lines come in as one log: each panel starts where the one above ended
  const bases = step.panels.reduce<number[]>((acc, _, i) => [...acc, i === 0 ? 0 : acc[i - 1] + linesOf(step.panels[i - 1])], []);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
      className="min-w-0 lg:min-h-[600px]"
    >
      <p className="eyebrow flex flex-wrap items-center gap-x-2">
        <span className="nums" style={{ color }}>
          {index + 1} / {total}
        </span>
        <span aria-hidden>·</span>
        <span className="font-mono normal-case tracking-normal">{node.tech}</span>
      </p>
      <p className="mt-2 text-balance font-display text-[22px] font-bold leading-7 tracking-[-0.02em]">{step.title}</p>
      <p className="mt-1.5 text-[15px] leading-[22px] text-muted">{step.note}</p>
      <div className="mt-4 flex flex-col gap-3">
        {step.panels.map((panel, i) => (
          <PanelView key={i} panel={panel} delay={(line) => FIRST_LINE + (bases[i] + line) * LINE_GAP} />
        ))}
      </div>
    </motion.div>
  );
}

function Frame({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-border p-3" style={{ background: "color-mix(in srgb, var(--bg) 55%, var(--surface))" }}>
      {label ? <p className="eyebrow mb-2 text-[11px]">{label}</p> : null}
      {children}
    </div>
  );
}

function PanelView({ panel, delay }: { panel: Panel; delay: (line: number) => number }) {
  const at = (line: number): CSSProperties => ({ animationDelay: `${delay(line)}ms` });
  switch (panel.type) {
    case "quote":
      return (
        <Frame label={panel.label}>
          <p className={`text-[16px] leading-6 ${styles.line}`} style={at(0)}>
            «{panel.text}»
          </p>
        </Frame>
      );
    case "code":
      return (
        <Frame label={panel.label}>
          <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[18px] text-text md:text-[12px]">
            {panel.lines.map((line, i) => (
              <span key={i} className={`block ${styles.line}`} style={{ ...at(i), ...hang(line) }}>
                <CodeLine text={line} />
              </span>
            ))}
          </pre>
        </Frame>
      );
    case "checks":
      return (
        <Frame label={panel.label}>
          <ul>
            {panel.items.map((item, i) => (
              <li key={item.text} className={`flex items-center gap-2.5 border-t border-border py-2 first:border-0 first:pt-0 last:pb-0 ${styles.line}`} style={at(i)}>
                <span
                  aria-hidden
                  className="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                  style={{
                    color: item.ok ? "var(--ok)" : "var(--danger)",
                    background: `color-mix(in srgb, ${item.ok ? "var(--ok)" : "var(--danger)"} 16%, transparent)`,
                  }}
                >
                  {item.ok ? "✓" : "✕"}
                </span>
                <span className="min-w-0 flex-1 text-[14px] leading-5">{item.text}</span>
                {item.note ? <span className={`nums shrink-0 font-mono text-[12px] leading-4 ${item.ok ? "text-muted" : "text-danger"}`}>{item.note}</span> : null}
              </li>
            ))}
          </ul>
        </Frame>
      );
    case "turns":
      return (
        <Frame label={panel.label}>
          <ul>
            {panel.items.map((item, i) => (
              <li key={i} className={`border-t border-border py-2 first:border-0 first:pt-0 last:pb-0 ${styles.line}`} style={at(i)}>
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[14px] leading-5 text-muted">{item.from}</span>
                  <span aria-hidden className="text-[13px] text-muted">
                    →
                  </span>
                  <span className="nums text-[15px] font-semibold leading-5" style={{ color: COLOR[item.tone] }}>
                    {item.to}
                  </span>
                </p>
                <p className="mt-0.5 text-[12px] leading-4 text-muted">{item.note}</p>
              </li>
            ))}
          </ul>
        </Frame>
      );
    case "cards":
      return (
        <div>
          <p className="eyebrow mb-2 text-[11px]">{panel.label}</p>
          <div className="flex flex-col gap-2">
            {panel.items.map((card, i) => (
              <div key={i} className={styles.line} style={at(i)}>
                <MiniCard kind={card.kind} who={card.who} badge={card.badge} title={card.title} when={card.when} mark={card.mark ?? null} />
              </div>
            ))}
          </div>
        </div>
      );
    case "push":
      return (
        <div className={`rounded-[18px] border border-border bg-surface-2 p-3 shadow-[var(--shadow-raised)] ${styles.line}`} style={at(0)}>
          <p className="flex items-center gap-2 text-[12px] leading-4 text-muted">
            <span aria-hidden className="grid size-5 place-items-center rounded-[6px] bg-accent/20">
              <svg width={13} height={9} viewBox="0 0 26 18" fill="none" stroke="var(--accent)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 10h6l2.5-6 4 12 3-9 1.8 3H25" />
              </svg>
            </span>
            <span className="font-semibold uppercase tracking-[0.06em]">Pulse</span>
            <span aria-hidden>·</span>
            <span>сейчас</span>
          </p>
          <p className="mt-2 text-[15px] font-semibold leading-5">{panel.title}</p>
          <p className="mt-0.5 text-[14px] leading-5 text-muted">{panel.body}</p>
          <p className="mt-2.5 border-t border-border pt-2 text-center text-[14px] font-semibold leading-5 text-accent">Принял</p>
        </div>
      );
    case "buttons":
      return (
        <div aria-hidden className={`grid grid-cols-3 gap-2 ${styles.line}`} style={at(0)}>
          <span className={`btn-primary grid h-11 place-items-center rounded-[12px] text-[14px] font-semibold text-bg ${styles.press}`}>Принял</span>
          <span className="btn-secondary grid h-11 place-items-center rounded-[12px] text-[14px] font-semibold">Уточнить</span>
          <span className="btn-secondary grid h-11 place-items-center rounded-[12px] text-[14px] font-semibold">Не могу</span>
        </div>
      );
  }
}
