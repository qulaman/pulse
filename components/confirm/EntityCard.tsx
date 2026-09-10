"use client";

import { useEffect, useRef, useState } from "react";

import { Chip, type ChipTone } from "@/components/ui/Chip";
import { formatDeadline } from "@/components/confirm/format";
import type { PostprocessedEntity } from "@/lib/ai/postprocess";
import type { Entity } from "@/lib/ai/schema";
import type { EntityPatch } from "@/lib/store/ingest";

const ICONS: Record<Entity["kind"], string> = {
  task: "✅",
  announcement: "📢",
  points: "➕",
  reminder: "🔔",
  recurrence: "🔁",
  delegation: "🧩",
  query: "❓",
};

/** Every kind keeps its main text under its own name — one editor, one field map. */
function mainField(
  entity: PostprocessedEntity,
): { key: "title" | "text" | "question" | "reason"; value: string } {
  switch (entity.kind) {
    case "task":
    case "recurrence":
    case "delegation":
      return { key: "title", value: entity.title };
    case "announcement":
    case "reminder":
      return { key: "text", value: entity.text };
    case "query":
      return { key: "question", value: entity.question };
    case "points":
      return { key: "reason", value: entity.reason ?? "" };
  }
}

function hasAssignee(
  entity: PostprocessedEntity,
): entity is PostprocessedEntity & { assignee_id: string | null } {
  return entity.kind === "task" || entity.kind === "delegation" || entity.kind === "recurrence";
}

/** D-16: what the chip says is exactly how sure the matcher is. */
function assigneeChip(entity: PostprocessedEntity, nameOf: (id: string) => string | undefined) {
  const match = entity.assignee;
  if (!match) return { label: "Кому?", tone: "danger" as ChipTone };

  const name =
    (match.user_id ? nameOf(match.user_id) : undefined) ??
    match.candidates.find((c) => c.user_id === match.user_id)?.full_name;

  if (match.status === "matched" && name) {
    return match.flag === "check"
      ? { label: `${name} · проверь`, tone: "warn" as ChipTone }
      : { label: name, tone: "neutral" as ChipTone };
  }
  if (match.status === "ambiguous") return { label: "Кто?", tone: "warn" as ChipTone };
  return { label: "Кому?", tone: "danger" as ChipTone };
}

const TONE_COLOR: Record<ChipTone, string> = {
  neutral: "var(--text)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  muted: "var(--text-muted)",
  accent: "var(--accent)",
};

type Props = {
  entity: PostprocessedEntity;
  index: number;
  compact: boolean;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (patch: EntityPatch) => void;
  onRemove: () => void;
  onOpenAssignee: () => void;
  onOpenDeadline: () => void;
  nameOf: (id: string) => string | undefined;
};

export function EntityCard({
  entity,
  index,
  compact,
  expanded,
  onToggle,
  onPatch,
  onRemove,
  onOpenAssignee,
  onOpenDeadline,
  nameOf,
}: Props) {
  const field = mainField(entity);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(field.value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const startEditing = () => {
    setDraft(field.value);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const value = draft.trim();
    if (value && value !== field.value) onPatch({ [field.key]: value } as EntityPatch);
    else setDraft(field.value);
  };

  const muted = entity.kind === "points" || entity.kind === "query";
  const collapsed = compact && !expanded;

  const deadline =
    entity.kind === "task" || entity.kind === "delegation"
      ? {
          iso: entity.kind === "task" ? entity.deadline_iso : null,
          confidence: entity.kind === "task" ? entity.deadline_confidence : null,
          sourceText: entity.kind === "task" ? entity.deadline_source_text : null,
        }
      : null;

  const chip = hasAssignee(entity) ? assigneeChip(entity, nameOf) : null;

  return (
    <article
      className="relative rounded-[16px] border border-border bg-surface p-3"
      style={{ opacity: muted ? 0.55 : 1 }}
      aria-label={`Сущность ${index + 1}`}
    >
      <button
        type="button"
        aria-label="Удалить"
        onClick={onRemove}
        className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center text-[18px] text-muted"
      >
        ×
      </button>

      <div className="flex gap-2 pr-10">
        <span aria-hidden className="text-[18px] leading-6">
          {ICONS[entity.kind]}
        </span>

        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") commit();
                if (event.key === "Escape") {
                  setDraft(field.value);
                  setEditing(false);
                }
              }}
              className="w-full rounded-[12px] border border-accent bg-surface-2 px-2 py-1 text-[16px] leading-[22px] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => (collapsed ? onToggle() : startEditing())}
              className={`block w-full text-left text-[16px] leading-[22px] ${collapsed ? "truncate" : ""}`}
            >
              {field.value || <span className="text-muted">Без текста</span>}
            </button>
          )}

          {collapsed ? (
            <p className="mt-1 truncate text-[13px] leading-4 text-muted">
              {chip ? <span style={{ color: TONE_COLOR[chip.tone] }}>{chip.label}</span> : null}
              {deadline ? (chip ? " · " : "") : null}
              {deadline
                ? deadline.iso
                  ? `до ${formatDeadline(deadline.iso)}`
                  : "без срока"
                : null}
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {chip ? (
                <Chip tone={chip.tone} onClick={onOpenAssignee}>
                  {chip.label}
                </Chip>
              ) : null}

              {deadline ? (
                deadline.iso ? (
                  <Chip
                    tone={(deadline.confidence ?? 1) < 0.8 ? "warn" : "neutral"}
                    onClick={onOpenDeadline}
                  >
                    до {formatDeadline(deadline.iso)}
                    {deadline.sourceText ? ` · „${deadline.sourceText}“` : ""}
                  </Chip>
                ) : (
                  <Chip tone="muted" onClick={onOpenDeadline}>
                    без срока
                  </Chip>
                )
              ) : null}

              {entity.kind === "task" && entity.priority === "high" ? (
                <Chip tone="danger" interactive={false}>
                  срочно
                </Chip>
              ) : null}

              {entity.kind === "reminder" && entity.remind_at_iso ? (
                <Chip tone="neutral" interactive={false}>
                  {formatDeadline(entity.remind_at_iso)}
                </Chip>
              ) : null}

              {entity.kind === "recurrence" ? (
                <Chip tone="neutral" interactive={false}>
                  {entity.rrule}
                </Chip>
              ) : null}

              {entity.kind === "query" ? (
                <Chip tone="muted" interactive={false}>
                  вопрос → ассистенту, не в задачи
                </Chip>
              ) : null}

              {entity.kind === "points" ? (
                <>
                  <Chip tone="muted" interactive={false}>
                    {entity.amount > 0 ? `+${entity.amount}` : entity.amount}
                  </Chip>
                  <Chip tone="muted" interactive={false}>
                    Очки включатся после пилота
                  </Chip>
                </>
              ) : null}

              {entity.blocked === "assignee_unmatched" && !chip ? (
                <Chip tone="danger" onClick={onOpenAssignee}>
                  Кому?
                </Chip>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {compact ? (
        <button
          type="button"
          onClick={onToggle}
          className="mt-2 text-[13px] leading-4 text-muted"
          aria-expanded={expanded}
        >
          {expanded ? "Свернуть" : "Подробнее"}
        </button>
      ) : null}
    </article>
  );
}
