"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

import { hasAssignee, KIND_LABEL, chosenId, mainField } from "@/components/desk/confirm/kinds";
import { PeopleField, PersonField, type PickPerson } from "@/components/desk/confirm/PersonField";
import { EventRepeatField, RecurrenceFields } from "@/components/desk/confirm/RepeatFields";
import { WhenField } from "@/components/desk/confirm/WhenField";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import type { PostprocessedEntity } from "@/lib/ai/postprocess";
import { shortName } from "@/lib/people/names";
import { describeParticipants, type EntityPatch } from "@/lib/store/ingest";

/** One line of the editor: the field's name on the left, its control on the right. */
function Field({ label, children, align = "center" }: { label: string; children: ReactNode; align?: "center" | "start" }) {
  return (
    <div className={`grid grid-cols-[60px_minmax(0,1fr)] gap-x-3 ${align === "center" ? "items-center" : "items-start"}`}>
      <span className={`text-[13px] leading-5 text-muted ${align === "start" ? "pt-[7px]" : ""}`}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * «Что» — the words of the order, edited where they stand: grows with its text, Enter keeps
 * it one paragraph (Shift+Enter breaks a line where a text may have lines), Ctrl+Enter sends
 * the whole order (the editor's own key). An emptied field takes its words back on the way out.
 */
function TextField({ value, onChange, label, multiline = false, placeholder, testId }: { value: string; onChange: (value: string) => void; label: string; multiline?: boolean; placeholder?: string; testId?: string }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const kept = useRef(value);
  useLayoutEffect(() => {
    if (value.trim()) kept.current = value;
    const node = area.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={area}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !(multiline && event.shiftKey)) event.preventDefault();
      }}
      onBlur={() => {
        if (!value.trim() && kept.current.trim() && !placeholder) onChange(kept.current);
      }}
      aria-label={label}
      spellCheck
      data-testid={testId}
      className="desk-input block min-h-9 w-full resize-none overflow-hidden px-0 py-[7px] text-[14px] leading-5 outline-none"
    />
  );
}

export type EditorContext = {
  people: readonly PickPerson[];
  nameOf: (id: string) => string | undefined;
  pointsEnabled: boolean;
  /** The entity whose namesakes the digits 1–4 pick (the first that asks «кому из них»). */
  digitsFor: number | null;
  onPickAssignee: (index: number, person: PickPerson) => void;
};

/**
 * One parsed entity as a compact form (D-154 wave 3): its kind, what is wrong with it, and the
 * fields of its kind — «Кому», «Что», «Срок» for a task; «Когда», «Кто», «Где», «Повтор» for a
 * meeting; the rule for a repeating task; the points and why. Every field edits the ingest
 * store's copy (`editEntity`), × drops the entity (`removeEntity`); nothing is kept here.
 */
export function EntityEditor({
  entity,
  index,
  ctx,
  onPatch,
  onRemove,
}: {
  entity: PostprocessedEntity;
  index: number;
  ctx: EditorContext;
  onPatch: (patch: EntityPatch) => void;
  onRemove: () => void;
}) {
  const field = mainField(entity);
  const muted = entity.kind === "query" || (entity.kind === "points" && !ctx.pointsEnabled);
  const assigneeId = hasAssignee(entity) ? chosenId(entity) : null;
  const ambiguous = hasAssignee(entity) && entity.assignee?.status === "ambiguous";
  const needsPerson = hasAssignee(entity) && !assigneeId;
  const checkPerson = hasAssignee(entity) && Boolean(assigneeId) && entity.assignee?.flag === "check";
  const candidates = entity.assignee?.candidates ?? [];
  const name = assigneeId ? (ctx.nameOf(assigneeId) ?? candidates.find((c) => c.user_id === assigneeId)?.full_name ?? null) : null;
  const n = index + 1;

  const status = needsPerson
    ? { text: ambiguous ? "кому из них?" : "нет исполнителя", tone: ambiguous ? "var(--warn)" : "var(--danger)" }
    : entity.kind === "event" && !entity.starts_at_iso
      ? { text: "нет времени", tone: "var(--danger)" }
      : entity.blocked === "points_blocked"
        ? { text: "не начисляются", tone: "var(--text-muted)" }
        : entity.kind === "points" && !ctx.pointsEnabled
          ? { text: "очки выключены", tone: "var(--text-muted)" }
          : entity.kind === "query"
            ? { text: "отвечу после отправки", tone: "var(--text-muted)" }
            : null;

  return (
    <article
      aria-label={`${KIND_LABEL[entity.kind]} ${n}`}
      data-testid="desk-entity"
      data-kind={entity.kind}
      className="flex flex-col gap-1 pb-3 pt-2"
      style={{ opacity: muted ? 0.6 : 1 }}
    >
      <header className="flex h-7 items-center gap-2">
        <span className="desk-label uppercase">{KIND_LABEL[entity.kind]}</span>
        {status ? (
          <span className="text-[13px] font-medium leading-4" style={{ color: status.tone }}>
            {status.text}
          </span>
        ) : null}
        <span className="ml-auto" />
        {entity.kind === "task" ? (
          <Tooltip label={entity.priority === "high" ? "Снять «срочно»" : "Отметить срочной"} side="bottom">
            <button
              type="button"
              aria-pressed={entity.priority === "high"}
              onClick={() => onPatch({ priority: entity.priority === "high" ? "normal" : "high" })}
              className={`desk-focus h-6 rounded-[2px] px-1.5 text-[13px] leading-none transition-colors duration-[120ms] ${
                entity.priority === "high" ? "font-semibold text-text underline underline-offset-4" : "text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              срочно
            </button>
          </Tooltip>
        ) : null}
        <Tooltip label="Убрать из поручения" side="bottom">
          <button
            type="button"
            aria-label={`Убрать: ${field.value || KIND_LABEL[entity.kind]}`}
            onClick={onRemove}
            data-testid="desk-entity-remove"
            className="desk-focus -mr-1.5 flex h-6 w-6 items-center justify-center rounded-[2px] text-[16px] leading-none text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text"
          >
            ×
          </button>
        </Tooltip>
      </header>

      {hasAssignee(entity) ? (
        <Field label="Кому" align={ambiguous && candidates.length > 0 ? "start" : "center"}>
          <PersonField
            value={assigneeId}
            name={name}
            people={ctx.people}
            suggestedIds={candidates.map((c) => c.user_id)}
            tone={needsPerson ? (ambiguous ? "warn" : "danger") : checkPerson ? "warn" : undefined}
            placeholder={ambiguous ? "Кому из них?" : "Кому?"}
            label={`Кому: ${field.value || KIND_LABEL[entity.kind]}`}
            onPick={(person) => ctx.onPickAssignee(index, person)}
            testId="desk-entity-who"
          />
          {ambiguous && candidates.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {candidates.slice(0, 4).map((candidate, at) => (
                <button
                  key={candidate.user_id}
                  type="button"
                  onClick={() => ctx.onPickAssignee(index, { id: candidate.user_id, full_name: candidate.full_name })}
                  className="desk-focus flex h-7 items-center gap-1.5 rounded-[2px] border border-border px-2 text-[13px] font-medium leading-4 transition-colors duration-[120ms] hover:bg-surface-2"
                >
                  {ctx.digitsFor === index ? <Kbd>{at + 1}</Kbd> : null}
                  {shortName(candidate.full_name)}
                </button>
              ))}
            </div>
          ) : null}
        </Field>
      ) : null}

      <Field label={entity.kind === "points" ? "За что" : entity.kind === "query" ? "Вопрос" : "Что"} align="start">
        <TextField
          value={field.value}
          onChange={(text) => onPatch({ [field.key]: text } as EntityPatch)}
          label={`Что: ${KIND_LABEL[entity.kind]} ${n}`}
          multiline={entity.kind === "announcement" || entity.kind === "note"}
          placeholder={entity.kind === "points" ? "Можно не писать" : undefined}
          testId="desk-entity-what"
        />
      </Field>

      {entity.kind === "task" ? (
        <Field label="Срок">
          <WhenField
            value={entity.deadline_iso}
            label={`Срок: ${entity.title}`}
            tone={entity.deadline_iso && (entity.deadline_confidence ?? 1) < 0.8 ? "warn" : undefined}
            heard={entity.deadline_source_text}
            emptyText={entity.priority === "high" ? "срочно — задать срок" : "без срока"}
            onChange={(iso) => onPatch({ deadline_iso: iso, deadline_confidence: iso === null ? null : 1, deadline_source_text: null })}
            testId="desk-entity-when"
          />
        </Field>
      ) : null}

      {entity.kind === "recurrence" ? (
        <Field label="Повтор" align="start">
          <RecurrenceFields value={entity} onChange={(next) => onPatch(next as EntityPatch)} />
        </Field>
      ) : null}

      {entity.kind === "reminder" ? (
        <Field label="Когда">
          <WhenField value={entity.remind_at_iso} label={`Когда напомнить: ${entity.text}`} emptyText="без времени" onChange={(iso) => onPatch({ remind_at_iso: iso })} />
        </Field>
      ) : null}

      {entity.kind === "event" ? (
        <>
          <Field label="Когда">
            <WhenField
              value={entity.starts_at_iso}
              label={`Когда: ${entity.title}`}
              allowNone={false}
              emptyText="Когда? — например «завтра 10:00»"
              tone={!entity.starts_at_iso ? "danger" : (entity.time_confidence ?? 1) < 0.8 ? "warn" : undefined}
              heard={(entity.time_confidence ?? 1) < 0.8 ? entity.time_source_text : null}
              onChange={(iso) =>
                onPatch({
                  starts_at_iso: iso,
                  time_confidence: 1,
                  time_source_text: null,
                  ...(entity.blocked === "time_missing" ? { blocked: undefined } : {}),
                })
              }
              testId="desk-entity-when"
            />
          </Field>
          <Field label="Кто">
            <PeopleField
              everyone={entity.everyone}
              ids={entity.participant_ids}
              people={ctx.people}
              summary={describeParticipants(entity, (id) => {
                const full = ctx.nameOf(id);
                return full ? shortName(full) : undefined;
              })}
              label={`Кто участвует: ${entity.title}`}
              onChange={({ everyone, ids }) => onPatch({ everyone, participant_ids: ids })}
            />
            {(entity.participants ?? []).some((p) => p.match.status !== "matched") ? (
              <p className="mt-1 text-[12px] leading-4 text-warn">
                Не нашёл в списке:{" "}
                {(entity.participants ?? [])
                  .filter((p) => p.match.status !== "matched")
                  .map((p) => p.name ?? p.query)
                  .join(", ")}
              </p>
            ) : null}
          </Field>
          <Field label="Где">
            <input
              value={entity.location ?? ""}
              onChange={(event) => onPatch({ location: event.target.value || null })}
              placeholder="Место — можно не писать"
              aria-label={`Где: ${entity.title}`}
              className="desk-input h-9 w-full px-0 text-[14px] leading-5 outline-none placeholder:text-muted"
            />
          </Field>
          <Field label="Повтор">
            <EventRepeatField value={entity.repeat} onChange={(repeat) => onPatch({ repeat })} />
          </Field>
        </>
      ) : null}

      {entity.kind === "points" ? (
        <Field label="Очки">
          <input
            type="number"
            step={1}
            value={entity.amount}
            onChange={(event) => onPatch({ amount: Number(event.target.value) || 0 })}
            aria-label="Сколько очков"
            className="desk-input nums h-9 w-28 px-0 text-[14px] leading-5 outline-none"
          />
        </Field>
      ) : null}

      {entity.kind === "announcement" ? <p className="pl-[72px] pt-1 text-[12px] leading-4 text-muted">Уйдёт всем в Эфир</p> : null}
      {entity.kind === "note" ? <p className="pl-[72px] pt-1 text-[12px] leading-4 text-muted">Заметка — видите только вы</p> : null}
      {entity.kind === "reminder" ? <p className="pl-[72px] pt-1 text-[12px] leading-4 text-muted">Напоминание придёт вам</p> : null}
    </article>
  );
}
