"use client";

import { useEffect, useRef, useState } from "react";

import { Chip, type ChipTone } from "@/components/ui/Chip";
import { formatDeadline } from "@/components/confirm/format";
import { ParticipantsPicker } from "@/components/confirm/ParticipantsPicker";
import { WhenSheet } from "@/components/confirm/WhenSheet";
import type { PostprocessedEntity } from "@/lib/ai/postprocess";
import type { Entity } from "@/lib/ai/schema";
import { shortNames } from "@/lib/people/aliases";
import { describeParticipants, type EntityPatch } from "@/lib/store/ingest";

const ICON_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** One stroke family for every kind — platform emoji differ from phone to phone. */
const ICONS: Record<Entity["kind"], { color: string; path: React.ReactNode }> = {
  task: { color: "var(--accent)", path: <><rect x="4" y="4" width="16" height="16" rx="4" /><polyline points="8,12.5 11,15.5 16,9.5" /></> },
  announcement: { color: "var(--gold)", path: <><path d="M4 10v4h3l6 4V6l-6 4z" /><path d="M16.5 9.5a3.5 3.5 0 0 1 0 5" /></> },
  points: { color: "var(--gold)", path: <><circle cx="12" cy="12" r="8" /><path d="M12 8.5v7M8.5 12h7" /></> },
  reminder: { color: "var(--warn)", path: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></> },
  event: { color: "var(--accent)", path: <><rect x="3.5" y="5.5" width="17" height="14" rx="3" /><path d="M8 3.5v4M16 3.5v4M3.5 10.5h17" /></> },
  note: { color: "var(--text-muted)", path: <><path d="M6 4h8l4 4v12H6z" /><polyline points="14,4 14,8 18,8" /><path d="M9 12.5h6M9 16h4" /></> },
  recurrence: { color: "var(--accent)", path: <><path d="M4 12a8 8 0 0 1 13.5-5.8" /><polyline points="18,3 18,7 14,7" /><path d="M20 12a8 8 0 0 1-13.5 5.8" /><polyline points="6,21 6,17 10,17" /></> },
  delegation: { color: "var(--accent)", path: <><circle cx="8" cy="8" r="3" /><circle cx="17" cy="15" r="3" /><path d="M11 8h3.5a2.5 2.5 0 0 1 0 5H13" /></> },
  query: { color: "var(--text-muted)", path: <><circle cx="12" cy="12" r="8.5" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></> },
};

function KindIcon({ kind }: { kind: Entity["kind"] }) {
  const icon = ICONS[kind];
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
      style={{ color: icon.color, background: `color-mix(in srgb, ${icon.color} 14%, transparent)` }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" {...ICON_STROKE}>{icon.path}</svg>
    </span>
  );
}

/** Every kind keeps its main text under its own name — one editor, one field map. */
function mainField(
  entity: PostprocessedEntity,
): { key: "title" | "text" | "question" | "reason"; value: string } {
  switch (entity.kind) {
    case "task":
    case "recurrence":
    case "delegation":
    case "event":
      return { key: "title", value: entity.title };
    case "announcement":
    case "reminder":
    case "note":
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
  return entity.kind === "task" || entity.kind === "delegation" || entity.kind === "recurrence" || entity.kind === "points";
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
  ok: "var(--ok)",
  gold: "var(--gold)",
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
  /** Inline pick of a matcher candidate — the shortlist under the card. */
  onPickAssignee: (user: { user_id: string; full_name: string }) => void;
  /** Active people of the company — shown inline when the matcher found nobody. */
  people: { user_id: string; full_name: string }[];
  /** Company setting (D-48): off → the points card is dimmed and not sent. */
  pointsEnabled: boolean;
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
  onPickAssignee,
  people,
  pointsEnabled,
  onOpenDeadline,
  nameOf,
}: Props) {
  const field = mainField(entity);
  // an event has a second editable line -- the place; everything else edits its main text
  const [editKey, setEditKey] = useState<null | "main" | "location">(null);
  const editing = editKey !== null;
  const shortLabels = shortNames(people.map((p) => ({ id: p.user_id, full_name: p.full_name })));
  const location = entity.kind === "event" ? (entity.location ?? "") : "";
  const editedValue = editKey === "location" ? location : field.value;
  const [draft, setDraft] = useState(field.value);
  const inputRef = useRef<HTMLInputElement>(null);
  const [whenOpen, setWhenOpen] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const startEditing = (key: "main" | "location" = "main") => {
    setDraft(key === "location" ? location : field.value);
    setEditKey(key);
  };

  const commit = () => {
    const key = editKey;
    setEditKey(null);
    const value = draft.trim();
    if (key === "location") {
      if (value !== location) onPatch({ location: value || null } as EntityPatch);
      return;
    }
    if (value && value !== field.value) onPatch({ [field.key]: value } as EntityPatch);
    else setDraft(field.value);
  };

  const muted = entity.kind === "query" || (entity.kind === "points" && !pointsEnabled);
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
      className="relative card p-3"
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
        <KindIcon kind={entity.kind} />

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
                  setDraft(editedValue);
                  setEditKey(null);
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
              {field.value || (
                <span className="text-muted">{entity.kind === "points" ? "За что? (можно не писать)" : "Без текста"}</span>
              )}
            </button>
          )}

          {collapsed && entity.kind === "event" ? (
            <p className="mt-1 truncate text-[13px] leading-4 text-muted">
              {entity.starts_at_iso ? (
                formatDeadline(entity.starts_at_iso)
              ) : (
                <span style={{ color: TONE_COLOR.danger }}>Когда?</span>
              )}
              {" · "}
              {describeParticipants(entity, nameOf)}
            </p>
          ) : collapsed ? (
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

              {entity.kind === "event" ? (
                <>
                  {entity.starts_at_iso ? (
                    <Chip
                      tone={(entity.time_confidence ?? 1) < 0.8 ? "warn" : "neutral"}
                      onClick={() => setWhenOpen(true)}
                    >
                      {formatDeadline(entity.starts_at_iso)}
                      {(entity.time_confidence ?? 1) < 0.8 && entity.time_source_text
                        ? ` · „${entity.time_source_text}“`
                        : ""}
                    </Chip>
                  ) : (
                    <Chip tone="danger" onClick={() => setWhenOpen(true)}>
                      Когда?
                    </Chip>
                  )}

                  <Chip tone="neutral" onClick={() => setWhoOpen(true)}>
                    {describeParticipants(entity, nameOf)}
                  </Chip>

                  <Chip tone={entity.location ? "neutral" : "muted"} onClick={() => startEditing("location")}>
                    {entity.location || "Место?"}
                  </Chip>
                </>
              ) : null}

              {entity.kind === "reminder" && entity.remind_at_iso ? (
                <Chip tone="neutral" interactive={false}>
                  {formatDeadline(entity.remind_at_iso)}
                </Chip>
              ) : null}

              {entity.kind === "note" ? (
                <Chip tone="muted" interactive={false}>
                  заметка — видишь только ты
                </Chip>
              ) : null}

              {entity.kind === "recurrence" ? (
                <Chip tone="neutral" interactive={false}>
                  {entity.rrule}
                </Chip>
              ) : null}

              {entity.kind === "query" ? (
                <Chip tone="muted" interactive={false}>
                  вопрос — отвечу на Пульсе после отправки
                </Chip>
              ) : null}

              {entity.kind === "points" ? (
                <>
                  <Chip tone={pointsEnabled ? "accent" : "muted"} interactive={false}>
                    {entity.amount > 0 ? `+${entity.amount}` : entity.amount}
                  </Chip>
                  {!pointsEnabled ? (
                    <Chip tone="muted" interactive={false}>
                      Очки выключены · Настройки
                    </Chip>
                  ) : null}
                </>
              ) : null}

              {entity.blocked === "assignee_unmatched" && !chip ? (
                <Chip tone="danger" onClick={onOpenAssignee}>
                  Кому?
                </Chip>
              ) : null}
            </div>
          )}

          {entity.kind === "event" && !collapsed ? (
            <>
              {(entity.participants ?? []).some((p) => p.match.status !== "matched") ? (
                <p className="mt-2 text-[13px] leading-4 text-warn">
                  Не нашёл в списке:{" "}
                  {(entity.participants ?? [])
                    .filter((p) => p.match.status !== "matched")
                    .map((p) => p.name ?? p.query)
                    .join(", ")}
                </p>
              ) : null}

              {entity.body ? (
                <p className="mt-2 text-[14px] leading-5 text-muted">{entity.body}</p>
              ) : null}

              <WhenSheet
                open={whenOpen}
                onClose={() => setWhenOpen(false)}
                currentIso={entity.starts_at_iso}
                onPick={(iso) =>
                  onPatch({
                    starts_at_iso: iso,
                    time_confidence: 1,
                    time_source_text: null,
                    blocked: undefined,
                  } as EntityPatch)
                }
              />
              <ParticipantsPicker
                open={whoOpen}
                onClose={() => setWhoOpen(false)}
                everyone={entity.everyone}
                selectedIds={entity.participant_ids}
                onDone={({ everyone, ids }) =>
                  onPatch({ everyone, participant_ids: ids } as EntityPatch)
                }
              />
            </>
          ) : null}

          {hasAssignee(entity) && entity.assignee?.status !== "matched" && !collapsed ? (
            <div className="mt-3 rounded-[12px] border border-warn/40 bg-warn/10 px-3 py-2">
              <p className="text-[13px] leading-4 text-warn">
                {entity.assignee?.status === "ambiguous" ? "Не понял, кому из них:" : "Не понял, кому это. Выбери:"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {/* first names on the chips: full names run one per line and push the button off screen */}
                {((entity.assignee?.candidates.length ?? 0) > 0
                  ? (entity.assignee?.candidates ?? []).slice(0, 4)
                  : people.slice(0, 8)
                ).map((candidate) => (
                  <Chip
                    key={candidate.user_id}
                    tone="accent"
                    onClick={() => onPickAssignee({ user_id: candidate.user_id, full_name: candidate.full_name })}
                  >
                    {shortLabels.get(candidate.user_id) ?? candidate.full_name}
                  </Chip>
                ))}
                <Chip tone="neutral" onClick={onOpenAssignee}>
                  {(entity.assignee?.candidates.length ?? 0) > 0 ? "Другой…" : "Ещё…"}
                </Chip>
              </div>
            </div>
          ) : null}
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
