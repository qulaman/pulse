"use client";

/**
 * The phrase in hand, as a document on the same sheet: the pipeline (save → recognise → parse)
 * as three numbered lines; the confirmation as an order with numbered items and form fields;
 * «not understood», the answer from the board, the failures, the text line's examples.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useState, type ReactNode } from "react";

import { ERRORS, STAGES, UNPARSED, hhmm, personById, type Draft } from "@/app/dev/pulse-alt/fixtures";

import { KIND_WORD, dative, draftSummary, isAway, isSendable, nameOf, plural, whenShort as when } from "./model";
import { useStrict, type Doc } from "./Strict";
import { EASE, Figure, Icon, Key, Lbl, Scan, VoiceClip, buzz, cx } from "./ui";

/** `doc` comes as a prop: while the document leaves, AnimatePresence keeps the last one. */
export function DocView({ doc }: { doc: Doc }) {
  return (
    <motion.div className="absolute inset-0" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
      <AnimatePresence initial={false}>
        <DocSwitch key={doc.kind === "error" ? `error-${doc.code}` : doc.kind} doc={doc} />
      </AnimatePresence>
    </motion.div>
  );
}

function DocSwitch({ doc }: { doc: Doc }) {
  switch (doc.kind) {
    case "parsing":
      return <Parsing doc={doc} />;
    case "confirm":
      return <Confirm stamping={Boolean(doc.stamping)} />;
    case "unparsed":
      return <Unparsed heard={doc.heard} />;
    case "answer":
      return <Answer said={doc.said} lines={doc.lines} taskIds={doc.taskIds} />;
    case "error":
      return <Failure code={doc.code} voiceSec={doc.voiceSec} />;
    case "text":
      return <TextDoc />;
  }
}

function Frame({ label, right, children, testId, footer }: { label: ReactNode; right?: ReactNode; children: ReactNode; testId: string; footer?: ReactNode }) {
  return (
    <motion.section
      className="absolute inset-0 flex flex-col"
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -60, transition: { duration: 0.32, ease: EASE } }}
      transition={{ duration: 0.32, ease: EASE }}
      data-testid={testId}
    >
      <div className="flex h-11 shrink-0 items-center justify-between px-5">
        <span className="flex min-w-0 items-center gap-2">{label}</span>
        {right}
      </div>
      <motion.div className="relative mx-5 h-px shrink-0" style={{ background: "linear-gradient(90deg, rgba(70,228,255,.85), rgba(150,215,255,.15) 60%, rgba(255,51,85,.55))", originX: 0 }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.5, ease: EASE }} />
      <Scan delay={0.05} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
      {footer}
    </motion.section>
  );
}

function CloseLink({ label = "Закрыть" }: { label?: string }) {
  const s = useStrict();
  return (
    <button type="button" className="lbl -mr-1 h-11 px-1" style={{ color: "var(--cyan-hi)" }} onClick={() => s.closeDoc()} data-testid="doc-close">
      {label}
    </button>
  );
}

// ---- the pipeline -------------------------------------------------------------------------------

const STAGE_MS = { 1: 700, 2: 1150, 3: 1250 } as const;

function Parsing({ doc }: { doc: Extract<Doc, { kind: "parsing" }> }) {
  const s = useStrict();
  const f = doc.slow ? 1.7 : 1;
  const rows = doc.source === "voice" ? ([1, 2, 3] as const) : ([3] as const);
  const heard = doc.result.kind === "drafts" ? doc.result.heard : doc.result.kind === "unparsed" ? doc.result.heard : doc.result.said;
  const kinds = doc.result.kind === "drafts" ? doc.result.drafts.map((d) => KIND_WORD[d.kind]) : doc.result.kind === "answer" ? ["Вопрос к доске"] : [];
  return (
    <Frame
      testId="doc-parsing"
      label={
        <>
          <Lbl tone="ink">{doc.source === "voice" ? "Фраза" : "Строка"}</Lbl>
          <Lbl>· {hhmm(s.now.toISOString())}</Lbl>
        </>
      }
      right={doc.source === "voice" ? <span className="mono text-[12px]" style={{ color: "var(--text-2)" }}>0:{String(doc.voiceSec).padStart(2, "0")}</span> : null}
    >
      <ol className="mt-1">
        {rows.map((n) => {
          const state = doc.stage > n ? "done" : doc.stage === n ? "active" : "wait";
          const label = STAGES[n]!.label;
          return (
            <li key={n} className="py-3" style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="flex items-center gap-3">
                <span className="mono w-6 text-[12px]" style={{ color: state === "wait" ? "var(--text-3)" : "var(--text)" }}>
                  {state === "done" ? "✓" : `0${n}`}
                </span>
                <span className="flex-1 text-[17px] font-medium" style={{ color: state === "wait" ? "var(--text-3)" : "var(--text)" }}>
                  {label}
                </span>
                <span className="lbl" style={{ color: state === "active" ? "var(--cyan)" : "var(--text-3)" }}>
                  {state === "done" ? `готово · ${((STAGE_MS[n] * f) / 1000).toFixed(1).replace(".", ",")} с` : state === "active" ? "идёт" : "ждёт"}
                </span>
              </div>
              <div className="ml-9 mt-2 h-[3px]" style={{ background: "var(--line)" }}>
                {state !== "wait" ? (
                  <motion.div
                    className="h-full"
                    style={{ background: state === "done" ? "var(--text-2)" : "var(--cyan)", boxShadow: state === "done" ? "none" : "0 0 10px rgba(70,228,255,.9)", originX: 0 }}
                    initial={{ scaleX: state === "done" ? 1 : 0 }}
                    animate={{ scaleX: 1 }}
                    transition={state === "active" ? { duration: (STAGE_MS[n] * f) / 1000, ease: "linear" } : { duration: 0 }}
                  />
                ) : null}
              </div>
              {n === 1 && state === "done" ? (
                <motion.p className="ml-9 mt-2 flex items-center gap-2 text-[13px]" style={{ color: "var(--text-2)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  Запись на сервере — голос не потеряется при любом сбое
                </motion.p>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div className="mt-5">
        <Lbl>{doc.stage >= 3 ? (doc.source === "voice" ? "Распознано" : "Строка") : "Распознаю"}</Lbl>
        {doc.stage >= 3 ? (
          <p className="mt-2 text-[16px] leading-[1.45]" style={{ color: "var(--text)" }}>
            {heard.split(" ").map((w, i, all) => (
              <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.012, duration: 0.04 }}>
                {i === 0 ? "«" : ""}
                {w}
                {i === all.length - 1 ? "»" : " "}
              </motion.span>
            ))}
          </p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {[92, 100, 78, 96, 64].map((w, i) => (
              <motion.div key={i} className="h-[10px]" style={{ width: `${w}%`, background: "rgba(150,215,255,.1)" }} animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.1 }} />
            ))}
          </div>
        )}
      </div>
      {doc.stage >= 3 && kinds.length ? (
        <div className="mt-5">
          <Lbl>Нахожу</Lbl>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {kinds.map((k, i) => (
              <motion.span key={i} className="lbl px-2 py-1.5" style={{ boxShadow: "inset 0 0 0 1px rgba(70,228,255,.65)", color: "var(--cyan-hi)", background: "var(--cyan-tint)" }} initial={{ opacity: 0, scale: 1.3 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 + i * (0.8 * f / Math.max(1, kinds.length)), duration: 0.14, ease: "easeIn" }}>
                {k}
              </motion.span>
            ))}
          </div>
        </div>
      ) : null}
    </Frame>
  );
}

// ---- the confirmation: an order with numbered items ---------------------------------------------

function Confirm({ stamping }: { stamping: boolean }) {
  const s = useStrict();
  const [showHeard, setShowHeard] = useState(false);
  const blocked = s.drafts.filter((d) => !isSendable(d)).length;
  return (
    <Frame
      testId="doc-confirm"
      label={
        <>
          <Lbl tone="ink">Распоряжение</Lbl>
          <Lbl>· {hhmm(s.now.toISOString())} · {s.drafts.length} {plural(s.drafts.length, ["пункт", "пункта", "пунктов"])}</Lbl>
        </>
      }
      right={<CloseLink />}
      footer={
        (s.offhours || blocked) && !stamping ? (
          <motion.div className="mx-5 flex min-h-[48px] shrink-0 items-center gap-2.5 py-1.5" style={{ borderTop: "1px solid var(--line-2)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid={s.offhours ? "offhours" : "blocked-note"}>
            <span className="block h-2 w-2 shrink-0" style={{ background: "var(--cyan)" }} />
            {s.offhours ? (
              <>
                <span className="min-w-0 flex-1 text-[13px] leading-[1.3]">
                  {hhmm(s.now.toISOString())} — вне окна 08:00–21:00
                </span>
                <Key tone="line" className="h-10 shrink-0 px-3 text-[13px]" onClick={() => s.send(true)} testId="send-now">
                  Отправить сейчас
                </Key>
              </>
            ) : (
              <span className="min-w-0 flex-1 text-[13px] leading-[1.3]" style={{ color: "var(--cyan)" }}>
                {blocked === 1 ? "Задача без адресата не уйдёт — нажмите «Кому?»" : `${blocked} задачи без адресата не уйдут`}
              </span>
            )}
          </motion.div>
        ) : null
      }
    >
      <h2 className="mt-3 text-[22px] font-semibold leading-[1.2] tracking-[-0.018em]" data-testid="summary">
        {draftSummary(s.drafts)}
      </h2>
      <div className="mono mt-2 flex items-center gap-2 text-[10.5px] uppercase" style={{ color: "var(--text-3)" }}>
        <span className="block h-1.5 w-1.5 rotate-45" style={{ background: "var(--red)", boxShadow: "0 0 6px rgba(255,51,85,.9)" }} />
        допуск: директор · подпись при отправке
      </div>
      {s.heard ? (
        <button type="button" className="mt-2 flex w-full items-start gap-2 text-left" onClick={() => setShowHeard((v) => !v)}>
          <Lbl className="mt-[3px] shrink-0">Слышал {showHeard ? "▴" : "▾"}</Lbl>
          <span className={cx("text-[13.5px] leading-[1.4]", !showHeard && "line-clamp-1")} style={{ color: "var(--text-2)" }}>
            «{s.heard}»
          </span>
        </button>
      ) : null}
      <ol className="cut frame glass mt-3 px-3">
        <AnimatePresence initial={false}>
          {s.drafts.map((d, i) => (
            <motion.li
              key={d.id}
              layout="position"
              className="relative overflow-hidden"
              style={{ borderBottom: i < s.drafts.length - 1 ? "1px solid var(--line)" : "none" }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: stamping && !isSendable(d) ? 0.3 : 1, y: 0 }}
              exit={{ opacity: 0, height: 0, transition: { duration: 0.24, ease: EASE } }}
              transition={{ delay: stamping ? 0 : 0.04 * i, duration: 0.26, ease: EASE }}
            >
              <DraftRow d={d} n={i + 1} />
              {stamping && isSendable(d) ? (
                <motion.span
                  className="lbl pointer-events-none absolute right-12 top-3 px-2 py-1"
                  style={{ color: "#FFE3E8", boxShadow: "inset 0 0 0 1.5px #FF3355, 0 0 16px rgba(255,51,85,.55)", rotate: -5, background: "rgba(40,6,14,.92)", textShadow: "0 0 8px rgba(255,51,85,.8)" }}
                  initial={{ opacity: 0, scale: 1.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05 * i, duration: 0.13, ease: "easeIn" }}
                >
                  {s.offhours ? "Утром 08:00" : "Отправлено"}
                </motion.span>
              ) : null}
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {s.drafts.length === 0 ? (
        <p className="py-6 text-center text-[14px]" style={{ color: "var(--text-2)" }}>
          Всё убрано. Закройте или скажите заново.
        </p>
      ) : null}
    </Frame>
  );
}

function DraftRow({ d, n }: { d: Draft; n: number }) {
  const s = useStrict();
  const patch = (fn: (x: Draft) => Draft) => s.setDrafts((list) => list.map((x) => (x.id === d.id ? fn(x) : x)));
  const remove = () => {
    buzz(6);
    s.setDrafts((list) => list.filter((x) => x.id !== d.id));
  };
  const blocked = !isSendable(d);
  return (
    <div className="py-3" data-testid={`draft-${d.id}`}>
      <div className="flex h-7 items-center gap-2.5">
        <span className="mono w-5 text-[11px]" style={{ color: "var(--text-3)" }}>
          {String(n).padStart(2, "0")}
        </span>
        <Lbl tone={blocked ? "seal" : "ink"}>{KIND_WORD[d.kind]}</Lbl>
        {d.kind === "announcement" ? <Lbl>· {d.audience} · {d.reach} чел</Lbl> : null}
        <span className="ml-auto" />
        {d.kind === "task" && d.voiceSec ? <VoiceClip sec={d.voiceSec} short /> : null}
        <button type="button" className="-mr-2.5 grid h-11 w-11 shrink-0 place-items-center" aria-label="Убрать" onClick={remove} style={{ color: "var(--text-2)" }} data-testid={`remove-${d.id}`}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="pl-[30px]">
        {d.kind === "points" ? (
          <div className="flex items-baseline gap-3">
            <span className="num text-[32px] font-semibold leading-none" style={{ color: "var(--text)" }}>
              +{d.amount}
            </span>
            <span className="text-[17px] font-medium">{dative(d.personId)}</span>
          </div>
        ) : null}
        <Editable
          value={d.kind === "task" || d.kind === "event" || d.kind === "recurrence" ? d.title : d.kind === "points" ? d.reason : d.text}
          onChange={(v) =>
            patch((x) =>
              x.kind === "task" || x.kind === "event" || x.kind === "recurrence" ? { ...x, title: v } : x.kind === "points" ? { ...x, reason: v } : { ...x, text: v },
            )
          }
          className={cx(d.kind === "points" ? "mt-1 text-[14.5px]" : "text-[17.5px] font-medium leading-[1.3] tracking-[-0.01em]")}
        />
        <Fields d={d} />
      </div>
    </div>
  );
}

function Editable({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  if (editing) {
    return (
      <textarea
        autoFocus
        rows={2}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (v.trim() && v.trim() !== value) onChange(v.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        className={cx(className, "block w-full resize-none bg-transparent outline-none")}
        style={{ boxShadow: "inset 0 -1.5px 0 var(--cyan)", fieldSizing: "content" } as React.CSSProperties}
      />
    );
  }
  return (
    <button
      type="button"
      className={cx(className, "block w-full text-left")}
      onClick={() => {
        setV(value);
        setEditing(true);
      }}
      aria-label={`Править: ${value}`}
    >
      {value}
    </button>
  );
}

function Field({ label, value, onClick, warn, testId }: { label: string; value: ReactNode; onClick?: () => void; warn?: boolean; testId?: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={!onClick}
      className="flex min-h-[46px] min-w-0 flex-col justify-center px-1.5 text-left"
      style={warn ? { boxShadow: "inset 0 0 0 1.5px var(--cyan)", background: "var(--cyan-tint)" } : { boxShadow: "inset 1px 0 0 var(--line)" }}
    >
      <span className="lbl" style={{ color: warn ? "var(--cyan)" : "var(--text-3)", fontSize: 9.5 }}>
        {label}
      </span>
      <span className="mt-0.5 block min-w-0 truncate text-[13.5px]" style={{ color: warn ? "var(--cyan)" : "var(--text)" }}>
        {value}
      </span>
    </button>
  );
}

/** A value that just changed lands like a stamp. */
function Landed({ k, children }: { k: string; children: ReactNode }) {
  return (
    <motion.span key={k} className="inline-block" initial={{ scale: 1.25, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.16, ease: "easeIn" }}>
      {children}
    </motion.span>
  );
}

function Fields({ d }: { d: Draft }) {
  const s = useStrict();
  const grid = "-ml-1.5 mt-2 grid grid-cols-[1fr_1.22fr_0.78fr]";
  switch (d.kind) {
    case "task":
      return (
        <div className={grid}>
          {d.assigneeId ? (
            <Field label="Кому" value={<Landed k={d.assigneeId}>{nameOf(d.assigneeId)}</Landed>} onClick={() => s.setSheet({ kind: "picker", target: { draftId: d.id } })} testId={`who-${d.id}`} />
          ) : (
            <Field label="Кому?" value={d.heardName ? `«${d.heardName}»` : "выбрать"} warn onClick={() => s.setSheet({ kind: "picker", target: { draftId: d.id } })} testId={`who-${d.id}`} />
          )}
          <Field label="Срок" value={<Landed k={d.deadline ?? "none"}>{when(d.deadline, s.now)}</Landed>} onClick={() => s.setSheet({ kind: "deadline", target: { draftId: d.id } })} />
          <Field label="Повтор" value={<Landed k={d.repeat ?? "none"}>{d.repeat ?? "нет"}</Landed>} onClick={() => s.setSheet({ kind: "repeat", draftId: d.id })} />
        </div>
      );
    case "announcement":
      return (
        <div className={grid}>
          <Field label="Кому" value={d.audience} />
          <Field label="Охват" value={`${d.reach} человек`} />
          <Field label="Куда" value="Эфир" />
        </div>
      );
    case "points":
      return null;
    case "event":
      return (
        <div className={grid}>
          <Field label="Когда" value={when(d.startsAt, s.now)} />
          <Field label="Где" value={d.place ?? "—"} />
          <Field
            label="Кто"
            value={d.peopleIds
              .map((id) => (isAway(id, s.now) ? `${nameOf(id)} (отпуск)` : nameOf(id)))
              .join(", ")}
          />
        </div>
      );
    case "recurrence":
      return (
        <div className={grid}>
          <Field label="Кому" value={nameOf(d.assigneeId)} />
          <Field label="Правило" value={d.rule} />
          <Field label="Первый раз" value={when(d.firstAt, s.now)} />
        </div>
      );
    case "note":
      return (
        <div className={grid}>
          <Field label="Куда" value="Заметки" />
          <Field label="Видит" value="только вы" />
        </div>
      );
    case "reminder":
      return (
        <div className={grid}>
          <Field label="Куда" value="Заметки" />
          <Field label="Когда" value={when(d.at, s.now)} />
          <Field label="Видит" value="только вы" />
        </div>
      );
  }
}

// ---- not understood -----------------------------------------------------------------------------

function Unparsed({ heard }: { heard: string }) {
  const s = useStrict();
  return (
    <Frame testId="doc-unparsed" label={<Lbl tone="ink">Не разобрал</Lbl>} right={<CloseLink />}>
      <p className="mt-5 text-[25px] font-medium leading-[1.25] tracking-[-0.02em]" style={{ color: "var(--text-2)" }}>
        «{heard}»
      </p>
      <p className="mt-3 text-[15px] leading-[1.4]">{UNPARSED.line}</p>
      <div className="mt-3 flex items-center gap-3">
        <VoiceClip sec={4} />
        <span className="text-[12.5px]" style={{ color: "var(--text-3)" }}>
          запись сохранена
        </span>
      </div>
      <div className="cut frame glass mt-6 px-3">
        {[
          { k: "Исправить текст", sub: "откроется строка с услышанным", on: () => s.openText(heard), tone: "ink" as const },
          { k: "Сделать задачей", sub: "как есть — останется выбрать, кому", on: () => s.makeTask(heard), tone: "line" as const },
          { k: "Закрыть", sub: "ничего не уйдёт", on: () => s.closeDoc(), tone: "line" as const },
        ].map((r, i) => (
          <button key={r.k} type="button" className="flex min-h-[58px] w-full items-center gap-3 text-left" style={{ borderBottom: i < 2 ? "1px solid var(--line)" : "none", color: i === 0 ? "var(--cyan-hi)" : "var(--text)" }} onClick={r.on} data-testid={`unparsed-${i}`}>
            <span className="mono w-5 text-[11px]" style={{ color: "var(--text-3)" }}>
              0{i + 1}
            </span>
            <span className="flex-1">
              <span className="block text-[16.5px] font-medium">{r.k}</span>
              <span className="block text-[12.5px]" style={{ color: "var(--text-3)" }}>
                {r.sub}
              </span>
            </span>
            <Icon name="arrow" size={18} />
          </button>
        ))}
      </div>
      <p className="mt-4 text-[12.5px]" style={{ color: "var(--text-3)" }}>
        Или удерживайте клавишу и скажите ещё раз.
      </p>
    </Frame>
  );
}

// ---- a question to the board --------------------------------------------------------------------

function Answer({ said, lines, taskIds }: { said: string; lines: string[]; taskIds: string[] }) {
  const s = useStrict();
  return (
    <Frame testId="doc-answer" label={<><Lbl tone="ink">Вопрос к доске</Lbl><Lbl>· {hhmm(s.now.toISOString())}</Lbl></>} right={<CloseLink />}>
      <p className="mt-4 text-[26px] font-semibold leading-[1.2] tracking-[-0.022em]">«{said}»</p>
      <div className="mt-5 flex items-center gap-2">
        <span className="block h-2 w-2 rotate-45" style={{ background: "var(--cyan)", boxShadow: "0 0 8px rgba(70,228,255,.9)" }} />
        <Lbl tone="seal">Ответ по доске</Lbl>
        <Lbl>· задачу не создаю</Lbl>
      </div>
      <div className="cut frame glass mt-2 px-3">
        {lines.map((l, i) => {
          const tid = taskIds[i];
          const body = (
            <>
              {i === 0 ? null : (
                <span className="mono w-5 shrink-0 pt-[3px] text-[11px]" style={{ color: "var(--text-3)" }}>
                  0{i}
                </span>
              )}
              <span className={cx("flex-1", i === 0 ? "text-[18px] font-medium" : "text-[15.5px] leading-[1.4]")}>{l}</span>
              {tid ? <Icon name="arrow" size={16} /> : null}
            </>
          );
          return (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.12, duration: 0.24, ease: EASE }}>
              {tid ? (
                <button type="button" className="flex w-full items-start gap-3 py-3 text-left" style={{ borderBottom: i < lines.length - 1 ? "1px solid var(--line)" : "none" }} onClick={() => s.setSheet({ kind: "thread", taskId: tid })} data-testid={`answer-line-${i}`}>
                  {body}
                </button>
              ) : (
                <div className="flex items-start gap-3 py-3" style={{ borderBottom: i < lines.length - 1 ? "1px solid var(--line)" : "none" }}>
                  {body}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Key tone="ink" onClick={() => s.closeDoc()}>
          Закрыть
        </Key>
        <Key tone="ghost" onClick={() => s.makeTask(said)}>
          Это задача, а не вопрос
        </Key>
      </div>
    </Frame>
  );
}

// ---- failures: the voice is never lost ----------------------------------------------------------

function Failure({ code, voiceSec }: { code: "tooShort" | "noMic" | "stt" | "kept"; voiceSec: number }) {
  const s = useStrict();
  const label = { tooShort: "Слишком коротко", noMic: "Нет микрофона", stt: "Не расслышал", kept: `Фраза · ${hhmm(s.now.toISOString())}` }[code];
  const text = ERRORS[code];
  return (
    <Frame testId={`doc-error-${code}`} label={<Lbl tone="ink">{label}</Lbl>} right={<CloseLink />}>
      <p className="mt-5 text-[23px] font-medium leading-[1.28] tracking-[-0.018em]">{text}</p>
      {code === "tooShort" ? (
        <div className="mt-6">
          <div className="flex items-end gap-3">
            <Figure value="0,6" className="font-semibold" style={{ fontSize: 56 }} />
            <span className="pb-2 text-[14px]" style={{ color: "var(--text-2)" }}>
              секунды — нужна хотя бы одна
            </span>
          </div>
          <div className="mt-4 h-[3px]" style={{ background: "var(--line)" }}>
            <motion.div className="h-full" style={{ background: "var(--cyan)", boxShadow: "0 0 8px rgba(70,228,255,.8)", originX: 0 }} initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: 3.4, ease: "linear" }} />
          </div>
          <p className="mt-2 text-[12.5px]" style={{ color: "var(--text-3)" }}>
            Закроется само
          </p>
        </div>
      ) : null}
      {code === "noMic" ? (
        <div className="mt-6" style={{ borderTop: "1px solid var(--line-2)" }}>
          {["Настройки iPhone → Safari", "Микрофон → «Разрешить»", "Вернитесь в Pulse и удерживайте клавишу"].map((st, i) => (
            <div key={st} className="flex items-center gap-3 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
              <span className="mono w-5 text-[11px]" style={{ color: "var(--text-3)" }}>
                0{i + 1}
              </span>
              <span className="text-[15.5px]">{st}</span>
            </div>
          ))}
          <div className="mt-4">
            <Key tone="ink" onClick={() => s.openText()}>
              Пока — строкой
            </Key>
          </div>
        </div>
      ) : null}
      {code === "stt" || code === "kept" ? (
        <div className="mt-6 p-4" style={{ border: "1.5px dashed rgba(255,129,151,.65)", background: "linear-gradient(180deg, rgba(255,51,85,.1), rgba(255,51,85,.03))" }}>
          <div className="flex items-center justify-between">
            <Lbl tone="ink">{code === "kept" ? "Голос — на телефоне" : "Запись сохранена"}</Lbl>
            <span className="mono text-[11.5px]" style={{ color: "var(--text-3)" }}>
              {hhmm(s.now.toISOString())}
            </span>
          </div>
          <div className="mt-2">
            <VoiceClip sec={voiceSec || 12} wide />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="relative block h-[3px] flex-1 overflow-hidden" style={{ background: "var(--line)" }}>
              <motion.span className="absolute inset-y-0 w-1/3" style={{ background: "var(--red-hi)", boxShadow: "0 0 8px rgba(255,51,85,.8)" }} animate={{ left: ["-33%", "100%"] }} transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }} />
            </span>
            <Lbl tone="ink">{code === "kept" ? "ждёт сети" : "повторю сам"}</Lbl>
          </div>
        </div>
      ) : null}
      {code === "kept" ? (
        <p className="mt-4 text-[13.5px] leading-[1.45]" style={{ color: "var(--text-2)" }}>
          Можно закрыть и работать дальше: строка «1 фраза ждёт сети» под шапкой, разбор начнётся сам, как только появится связь.
        </p>
      ) : null}
      {code === "stt" ? (
        <div className="mt-4">
          <Key tone="line" onClick={() => s.openText()}>
            Не ждать — написать строкой
          </Key>
        </div>
      ) : null}
    </Frame>
  );
}

// ---- the text line's page -----------------------------------------------------------------------

const EXAMPLES = [
  { text: "Марату к пятнице график работ по объекту на Абая", what: "задача" },
  { text: "Всем: в пятницу короткий день до 16:00", what: "объявление" },
  { text: "Что сейчас у Айгуль?", what: "вопрос к доске" },
  { text: "Напомни в три позвонить Серику насчёт техники", what: "напоминание" },
];

function TextDoc() {
  const s = useStrict();
  const pinned = s.personId && s.panel === "person" ? s.personId : null;
  return (
    <Frame testId="doc-text" label={<Lbl tone="ink">Строкой</Lbl>} right={<CloseLink />}>
      <p className="mt-4 text-[22px] font-semibold leading-[1.22] tracking-[-0.018em]">Одна строка — тот же разбор, что и голос.</p>
      {pinned ? (
        <p className="mt-2 text-[14px]" style={{ color: "var(--text-2)" }}>
          Строка уйдёт задачей {dative(pinned)} — {personById(pinned)?.position.toLowerCase()}.
        </p>
      ) : (
        <p className="mt-2 text-[14px]" style={{ color: "var(--text-2)" }}>
          Задачи, объявления, очки, встречи, вопросы к доске — всё в одной строке.
        </p>
      )}
      <div className="mt-6 flex items-center justify-between">
        <Lbl>Например</Lbl>
        <Lbl>тап — подставить</Lbl>
      </div>
      <div className="cut frame glass mt-2 px-3">
        {EXAMPLES.map((e, i) => (
          <button key={e.text} type="button" className="flex min-h-[52px] w-full items-center gap-3 py-2 text-left" style={{ borderBottom: i < EXAMPLES.length - 1 ? "1px solid var(--line)" : "none" }} onClick={() => s.openText(e.text)} data-testid={`example-${i}`}>
            <span className="mono w-5 shrink-0 text-[11px]" style={{ color: "var(--text-3)" }}>
              0{i + 1}
            </span>
            <span className="min-w-0 flex-1 text-[15px] leading-[1.35]">{e.text}</span>
            <span className="lbl shrink-0">{e.what}</span>
          </button>
        ))}
      </div>
    </Frame>
  );
}
