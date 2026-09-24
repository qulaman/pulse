"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { PeoplePicker } from "@/components/people/PeoplePicker";
import { NotifyDevices } from "@/components/notify/NotifyDevices";
import { Chip } from "@/components/ui/Chip";
import { TimeField } from "@/components/ui/datetime/TimeField";
import { Row, RowGroup } from "@/components/ui/Row";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { useRoster } from "@/lib/people/roster";
import {
  CATEGORY_HINT,
  CATEGORY_LABEL,
  categoryValue,
  DAY_SUMMARY_TIMES,
  DIGEST_EVERY,
  DIGEST_LABEL,
  MODE_HINT,
  MODE_LABEL,
  NOTIFY_CATEGORIES,
  NOTIFY_MODES,
  quietValue,
  UNSEEN_AFTER,
  type NotifyCategory,
  type NotifyPrefs,
} from "@/lib/push/prefs";

export const notifyPrefsKey = ["notify-prefs"] as const;

async function fetchPrefs(): Promise<NotifyPrefs> {
  const res = await fetch("/api/me/notifications", { credentials: "include" });
  if (!res.ok) throw new Error("prefs failed");
  return ((await res.json()) as { prefs: NotifyPrefs }).prefs;
}

async function putPrefs(prefs: NotifyPrefs): Promise<NotifyPrefs> {
  const res = await fetch("/api/me/notifications", {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error("prefs failed");
  return ((await res.json()) as { prefs: NotifyPrefs }).prefs;
}

type SheetKind =
  | { kind: "category"; category: NotifyCategory }
  | { kind: "digest" }
  | { kind: "day" }
  | { kind: "quiet" }
  | { kind: "meetings" }
  | { kind: "lock" }
  | { kind: "vip" };

/**
 * The director's own push rules (D-114). The first layer is one row per kind of news with its
 * mode; everything deeper opens in a sheet on a tap (принцип 1). Every change is saved at once
 * — optimistic, and the waiting queue obeys it on the server too.
 */
export function NotifySettings({ meId }: { meId: string }) {
  const queryClient = useQueryClient();
  const prefsQuery = useQuery({ queryKey: notifyPrefsKey, queryFn: fetchPrefs });
  const roster = useRoster();
  const [sheet, setSheet] = useState<SheetKind | null>(null);

  const save = useMutation({
    // one save at a time, in order: two quick taps never land out of order
    scope: { id: "notify-prefs" },
    mutationFn: putPrefs,
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: notifyPrefsKey });
      const before = queryClient.getQueryData<NotifyPrefs>(notifyPrefsKey);
      queryClient.setQueryData(notifyPrefsKey, next);
      return { before };
    },
    onError: (_error, _next, context) => {
      if (context?.before) queryClient.setQueryData(notifyPrefsKey, context.before);
      toast("Не сохранилось — проверьте связь и попробуйте ещё раз");
    },
    onSuccess: (saved) => queryClient.setQueryData(notifyPrefsKey, saved),
  });

  const prefs = prefsQuery.data;
  if (prefsQuery.isError) {
    return <p className="mt-6 text-[16px] leading-[22px] text-muted">Не получилось загрузить настройки. Обновите экран.</p>;
  }
  if (!prefs) return <NotifyBones />;

  const update = (change: (current: NotifyPrefs) => NotifyPrefs) => save.mutate(change(prefs));
  const setMode = (category: NotifyCategory, mode: NotifyPrefs["modes"][NotifyCategory]) =>
    update((p) => ({ ...p, modes: { ...p.modes, [category]: mode } }));

  const vipNames = prefs.vip
    .map((id) => roster.data?.find((person) => person.id === id)?.full_name.split(" ")[0])
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <h2 className="eyebrow mt-6 px-1">Что присылать</h2>
      <RowGroup className="mt-2">
        {NOTIFY_CATEGORIES.map((category) => (
          <Row
            key={category}
            icon={<CategoryIcon category={category} />}
            title={CATEGORY_LABEL[category]}
            value={categoryValue(prefs, category)}
            valueColor={prefs.modes[category] === "off" ? "var(--text-muted)" : undefined}
            tone={prefs.modes[category] === "off" ? "muted" : "accent"}
            onClick={() => setSheet({ kind: "category", category })}
          />
        ))}
        <Row icon={<AlarmIcon />} title="Мои напоминания" value="всегда" tone="muted" />
        <Row icon={<AlarmIcon />} title="Тревога «Охрана»" value="всегда" tone="danger" />
      </RowGroup>

      <h2 className="eyebrow mt-6 px-1">Когда</h2>
      <RowGroup className="mt-2">
        <Row icon={<StackIcon />} title="Сводка" value={DIGEST_LABEL[prefs.digest_every]} onClick={() => setSheet({ kind: "digest" })} />
        <Row icon={<SunIcon />} title="Итог дня" value={prefs.day_summary_at ?? "выключен"} onClick={() => setSheet({ kind: "day" })} />
        <Row icon={<MoonIcon />} title="Не беспокоить" value={quietValue(prefs)} onClick={() => setSheet({ kind: "quiet" })} />
        <Row
          icon={<MeetingIcon />}
          title="Во время встреч"
          value={prefs.meetings ? "только важное" : "всё как обычно"}
          onClick={() => setSheet({ kind: "meetings" })}
        />
      </RowGroup>

      <h2 className="eyebrow mt-6 px-1">Кто и как</h2>
      <RowGroup className="mt-2">
        <Row icon={<StarIcon />} title="Важные люди" value={vipNames || "никого"} onClick={() => setSheet({ kind: "vip" })} />
        <Row
          icon={<EyeIcon />}
          title="Экран блокировки"
          value={prefs.lock_text === "full" ? "весь текст" : "без слов"}
          onClick={() => setSheet({ kind: "lock" })}
        />
      </RowGroup>

      <h2 className="eyebrow mt-6 px-1">Устройства</h2>
      <NotifyDevices />

      <p className="mt-6 px-1 text-[13px] leading-[18px] text-muted">
        Сотрудники, секретарь и завхоз настроек не имеют: задачи и ответы приходят им в рабочие часы компании (Настройки → Компания →
        Тихие часы), заявки и напоминания — сразу.
      </p>

      {/* ---- sheets ---- */}
      <Sheet
        open={sheet?.kind === "category"}
        onClose={() => setSheet(null)}
        title={sheet?.kind === "category" ? CATEGORY_LABEL[sheet.category] : undefined}
      >
        {sheet?.kind === "category" ? (
          <>
            <p className="text-[15px] leading-[21px] text-muted">{CATEGORY_HINT[sheet.category]}</p>
            {sheet.category === "unseen" ? (
              <div className="mt-4">
                <p className="text-[13px] leading-4 text-muted">Сообщить, если не открыли за</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {UNSEEN_AFTER.map((min) => (
                    <Chip
                      key={min}
                      tone={prefs.unseen_after_min === min ? "accent" : "neutral"}
                      aria-pressed={prefs.unseen_after_min === min}
                      onClick={() => update((p) => ({ ...p, unseen_after_min: min }))}
                    >
                      {min} мин
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              {NOTIFY_MODES.map((mode) => (
                <Choice
                  key={mode}
                  label={MODE_LABEL[mode]}
                  hint={MODE_HINT[mode]}
                  selected={prefs.modes[sheet.category] === mode}
                  onClick={() => {
                    setMode(sheet.category, mode);
                    setSheet(null);
                  }}
                />
              ))}
            </div>
          </>
        ) : null}
      </Sheet>

      <Sheet open={sheet?.kind === "digest"} onClose={() => setSheet(null)} title="Сводка">
        <p className="text-[15px] leading-[21px] text-muted">
          Всё, что стоит на «Сводкой», копится и приходит одним пушем: «Сводка · 3 на приёмку · 2 вопроса». Пустая сводка не приходит, а
          то, что вы уже видели в приложении, в неё не попадает.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {DIGEST_EVERY.map((every) => (
            <Choice
              key={every}
              label={DIGEST_LABEL[every]}
              selected={prefs.digest_every === every}
              onClick={() => {
                update((p) => ({ ...p, digest_every: every }));
                setSheet(null);
              }}
            />
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet?.kind === "day"} onClose={() => setSheet(null)} title="Итог дня">
        <p className="text-[15px] leading-[21px] text-muted">
          Один пуш в конце дня: сколько принято, на приёмке, в работе, не открыто и просрочено по вашим задачам.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip
            tone={prefs.day_summary_at === null ? "accent" : "neutral"}
            aria-pressed={prefs.day_summary_at === null}
            onClick={() => update((p) => ({ ...p, day_summary_at: null }))}
          >
            Выключен
          </Chip>
          {DAY_SUMMARY_TIMES.map((time) => (
            <Chip
              key={time}
              tone={prefs.day_summary_at === time ? "accent" : "neutral"}
              aria-pressed={prefs.day_summary_at === time}
              onClick={() => update((p) => ({ ...p, day_summary_at: time }))}
            >
              {time}
            </Chip>
          ))}
        </div>
        <div className="mt-4">
          <TimeField
            label="Своё время"
            value={prefs.day_summary_at}
            step={15}
            onChange={(time) => update((p) => ({ ...p, day_summary_at: time }))}
          />
        </div>
      </Sheet>

      <Sheet open={sheet?.kind === "quiet"} onClose={() => setSheet(null)} title="Не беспокоить">
        <Toggle
          label="Тишина по расписанию"
          hint="В эти часы пуши копятся, а в конце приходит одна сводка «Пока вы отдыхали»"
          checked={prefs.quiet.on}
          onChange={(on) => update((p) => ({ ...p, quiet: { ...p.quiet, on } }))}
        />
        {prefs.quiet.on ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <p className="mb-1 px-1 text-[13px] leading-4 text-muted">с</p>
                <TimeField label="С" value={prefs.quiet.from} step={15} onChange={(from) => update((p) => ({ ...p, quiet: { ...p.quiet, from } }))} />
              </div>
              <div>
                <p className="mb-1 px-1 text-[13px] leading-4 text-muted">до</p>
                <TimeField label="До" value={prefs.quiet.to} step={15} onChange={(to) => update((p) => ({ ...p, quiet: { ...p.quiet, to } }))} />
              </div>
            </div>
            <div className="mt-2">
              <Toggle
                label="И выходные целиком"
                hint="Суббота и воскресенье — тишина весь день"
                checked={prefs.quiet.weekends}
                onChange={(weekends) => update((p) => ({ ...p, quiet: { ...p.quiet, weekends } }))}
              />
            </div>
            <p className="eyebrow mt-4">Пробивают тишину</p>
            <div className="mt-1 flex flex-col">
              <Toggle
                label="Мои напоминания"
                hint="«Напомни мне» со временем — вы сами его поставили"
                checked={prefs.pass.reminders}
                onChange={(reminders) => update((p) => ({ ...p, pass: { ...p.pass, reminders } }))}
              />
              <Toggle
                label="Посетитель"
                hint="Секретарь: «К вам посетитель»"
                checked={prefs.pass.visitors}
                onChange={(visitors) => update((p) => ({ ...p, pass: { ...p.pass, visitors } }))}
              />
              <Toggle
                label="Важные люди"
                hint="Их задачи и сообщения — и ночью"
                checked={prefs.pass.vip}
                onChange={(vip) => update((p) => ({ ...p, pass: { ...p.pass, vip } }))}
              />
            </div>
            <p className="mt-3 text-[13px] leading-4 text-muted">Тревога «Охрана» приходит всегда.</p>
          </>
        ) : null}
      </Sheet>

      <Sheet open={sheet?.kind === "meetings"} onClose={() => setSheet(null)} title="Во время встреч">
        <Toggle
          label="Только важное"
          hint="Пока идёт встреча из календаря, приходят тревога, посетитель, «скоро» и важные люди. Остальное — одной сводкой после встречи"
          checked={prefs.meetings}
          onChange={(meetings) => update((p) => ({ ...p, meetings }))}
        />
      </Sheet>

      <Sheet open={sheet?.kind === "lock"} onClose={() => setSheet(null)} title="Текст на блокировке">
        <div className="flex flex-col gap-2">
          <Choice
            label="Полностью"
            hint="Марат · «Отчёт по складу» — Отчёт почти готов"
            selected={prefs.lock_text === "full"}
            onClick={() => {
              update((p) => ({ ...p, lock_text: "full" }));
              setSheet(null);
            }}
          />
          <Choice
            label="Только что случилось"
            hint="Новое сообщение — без имени и слов. Удобно, когда телефон лежит на столе"
            selected={prefs.lock_text === "short"}
            onClick={() => {
              update((p) => ({ ...p, lock_text: "short" }));
              setSheet(null);
            }}
          />
        </div>
      </Sheet>

      <PeoplePicker
        mode="many"
        open={sheet?.kind === "vip"}
        onClose={() => setSheet(null)}
        title="Важные люди"
        hint="Их задачи и сообщения приходят сразу — даже если стоит «Тихо» или «Сводкой»"
        hideIds={[meId]}
        selectedIds={prefs.vip}
        onDone={({ ids }) => {
          update((p) => ({ ...p, vip: ids }));
          setSheet(null);
        }}
      />
    </>
  );
}

function Choice({ label, hint, selected, onClick }: { label: string; hint?: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex min-h-[56px] w-full items-center gap-3 rounded-[14px] border px-4 py-3 text-left transition-colors duration-[120ms] ${
        selected ? "border-accent bg-accent/10" : "border-border bg-surface-2"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] leading-[22px]">{label}</span>
        {hint ? <span className="mt-0.5 block text-[13px] leading-[18px] text-muted">{hint}</span> : null}
      </span>
      <span
        aria-hidden
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
        style={{ borderColor: selected ? "var(--accent)" : "var(--border)" }}
      >
        {selected ? <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} /> : null}
      </span>
    </button>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[52px] w-full items-center justify-between gap-3 py-1.5 text-left"
    >
      <span>
        <span className="block text-[16px] leading-[22px]">{label}</span>
        {hint ? <span className="block text-[13px] leading-[18px] text-muted">{hint}</span> : null}
      </span>
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full transition-colors duration-[120ms]"
        style={{ background: checked ? "var(--accent)" : "var(--border)" }}
      >
        <span
          className="absolute top-1 h-5 w-5 rounded-full bg-bg transition-transform duration-[120ms]"
          style={{ transform: checked ? "translateX(24px)" : "translateX(4px)" }}
        />
      </span>
    </button>
  );
}

function NotifyBones() {
  return (
    <div className="mt-6 flex flex-col gap-2" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card h-[174px] animate-pulse opacity-60" />
      ))}
    </div>
  );
}

/* ---- icons: the profile's stroke recipe ---- */
const stroke = {
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

function Icon({ children }: { children: ReactNode }) {
  return <svg {...stroke}>{children}</svg>;
}

function CategoryIcon({ category }: { category: NotifyCategory }) {
  switch (category) {
    case "review":
      return (
        <Icon>
          <path d="M4 10.5 8 14.5 16 5.5" />
        </Icon>
      );
    case "declined":
      return (
        <Icon>
          <circle cx="10" cy="10" r="6.5" />
          <path d="M5.5 14.5 14.5 5.5" />
        </Icon>
      );
    case "questions":
      return (
        <Icon>
          <path d="M7.5 7.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7" />
          <circle cx="10" cy="15" r=".9" fill="currentColor" stroke="none" />
        </Icon>
      );
    case "messages":
      return (
        <Icon>
          <path d="M4 5.5h12v8H9l-3.5 3v-3H4z" />
        </Icon>
      );
    case "unseen":
      return (
        <Icon>
          <path d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5z" />
          <path d="M4 16 16 4" />
        </Icon>
      );
    case "overdue":
      return (
        <Icon>
          <circle cx="10" cy="10.5" r="6.5" />
          <path d="M10 7v3.5l2.2 1.6" />
        </Icon>
      );
    case "secretary":
      return (
        <Icon>
          <path d="M5 11h10v3.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
          <path d="M15 12h1a1.5 1.5 0 0 1 0 3h-1M8 8.5c0-1 1-1 1-2M11 8.5c0-1 1-1 1-2" />
        </Icon>
      );
    case "calendar":
      return (
        <Icon>
          <rect x="3.5" y="5" width="13" height="11.5" rx="2" />
          <path d="M3.5 8.5h13M7 3.5v3M13 3.5v3" />
        </Icon>
      );
    case "team":
      return (
        <Icon>
          <circle cx="8" cy="7.5" r="2.5" />
          <path d="M3.5 15.5a4.5 4.5 0 0 1 9 0" />
          <path d="M14 6.5 17 9.5M17 6.5 14 9.5" />
        </Icon>
      );
    case "shop":
      return (
        <Icon>
          <rect x="3.5" y="8" width="13" height="8.5" rx="1.5" />
          <path d="M3 8h14v-2.5H3zM10 5.5v11M10 5.5C9 3.5 6.5 3 6.5 4.5S9 5.5 10 5.5c1-2 3.5-2.5 3.5-1S11 5.5 10 5.5" />
        </Icon>
      );
  }
}

const AlarmIcon = () => (
  <Icon>
    <path d="M5.5 13.5V9a4.5 4.5 0 0 1 9 0v4.5l1 1.5h-11z" />
    <path d="M10 2.5v1.2" />
  </Icon>
);
const StackIcon = () => (
  <Icon>
    <path d="M3.5 7 10 4l6.5 3L10 10z" />
    <path d="M3.5 10.5 10 13.5l6.5-3M3.5 14 10 17l6.5-3" />
  </Icon>
);
const SunIcon = () => (
  <Icon>
    <path d="M3 14.5h14M6 14.5a4 4 0 0 1 8 0M10 5v2M4.5 8.2l1.4 1.4M15.5 8.2l-1.4 1.4" />
  </Icon>
);
const MoonIcon = () => (
  <Icon>
    <path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" />
  </Icon>
);
const MeetingIcon = () => (
  <Icon>
    <circle cx="7" cy="7.5" r="2.3" />
    <circle cx="13.5" cy="8" r="2" />
    <path d="M2.8 15.5a4.3 4.3 0 0 1 8.4 0M11.2 12.3a3.8 3.8 0 0 1 6 3.2" />
  </Icon>
);
const StarIcon = () => (
  <Icon>
    <path d="m10 3.5 1.9 4 4.4.5-3.3 3 .9 4.3L10 13.1l-3.9 2.2.9-4.3-3.3-3 4.4-.5z" />
  </Icon>
);
const EyeIcon = () => (
  <Icon>
    <rect x="5.5" y="3" width="9" height="14" rx="2" />
    <path d="M8.5 14.5h3" />
  </Icon>
);
