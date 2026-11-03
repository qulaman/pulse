"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Avatar } from "@/components/desk/ui/PersonCell";
import { Button } from "@/components/ui/Button";
import { useAwardPoints } from "@/lib/points/queries";

const PRESETS = [5, 10, 20, 50];
const REASONS = ["за скорость", "за качество", "за инициативу", "за выручку"];

/** Who the dialog opens for: a person picked from a row, or nobody yet (the screen's own button). */
export type AwardFor = { userId?: string };

export type AwardPerson = { id: string; name: string; sub?: string | null };

const fold = (text: string) => text.toLowerCase().replace(/ё/g, "е").trim();

function Label({ children, htmlFor }: { children: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">
      {children}
    </label>
  );
}

/**
 * «Кому» as a desktop picker: type a few letters, ↑/↓ walk the people found, Enter takes one and
 * the caret goes on to the sum. The chosen person stands in the field; Backspace or a click on ×
 * empties it again.
 */
function PersonPicker({ people, value, onChange, autoFocus, next }: { people: AwardPerson[]; value: string; onChange: (id: string) => void; autoFocus: boolean; next: () => void }) {
  const [text, setText] = useState("");
  const [at, setAt] = useState(0);
  const [open, setOpen] = useState(false);
  const chosen = people.find((p) => p.id === value) ?? null;
  const found = useMemo(() => {
    const q = fold(text);
    return q ? people.filter((p) => fold(`${p.name} ${p.sub ?? ""}`).split(/\s+/).some((word) => word.startsWith(q)) || fold(p.name).includes(q)) : people;
  }, [people, text]);

  const take = (person: AwardPerson) => {
    onChange(person.id);
    setText("");
    setOpen(false);
    next();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (chosen) {
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        onChange("");
        setOpen(true);
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setAt((index) => (index + (event.key === "ArrowDown" ? 1 : found.length - 1)) % Math.max(1, found.length));
    } else if (event.key === "Enter") {
      // Enter here picks a person, it never sends the form
      event.preventDefault();
      if (found[at]) take(found[at]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <div className="field flex h-9 items-center gap-2 px-2.5">
        {chosen ? <Avatar name={chosen.name} size={22} /> : null}
        <input
          id="award-who"
          aria-label="Кому"
          role="combobox"
          aria-expanded={open && !chosen}
          aria-controls="award-who-list"
          aria-autocomplete="list"
          data-autofocus={autoFocus ? "" : undefined}
          value={chosen ? chosen.name : text}
          readOnly={Boolean(chosen)}
          placeholder="Начните имя — Ерлан, Айгуль…"
          onChange={(event) => {
            setText(event.target.value);
            setAt(0);
            setOpen(true);
          }}
          onFocus={() => !chosen && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-[14px] leading-5 outline-none placeholder:text-muted"
        />
        {chosen ? (
          <button
            type="button"
            aria-label="Выбрать другого"
            title="Другой человек · Backspace"
            onClick={() => {
              onChange("");
              setOpen(true);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[15px] leading-none text-muted hover:bg-surface-2 hover:text-text"
          >
            ×
          </button>
        ) : null}
      </div>
      {open && !chosen ? (
        <ul id="award-who-list" role="listbox" className="absolute inset-x-0 top-[calc(100%+4px)] z-10 max-h-[240px] overflow-y-auto rounded-[12px] border border-border bg-surface py-1" style={{ boxShadow: "var(--shadow-raised)" }}>
          {found.length === 0 ? <li className="px-3 py-2 text-[13px] text-muted">Никого с таким именем</li> : null}
          {found.map((person, index) => (
            <li key={person.id} role="option" aria-selected={index === at}>
              <button
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setAt(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => take(person)}
                className={`flex h-9 w-full items-center gap-2.5 px-3 text-left text-[14px] leading-5 ${index === at ? "bg-surface-2" : ""}`}
              >
                <Avatar name={person.name} size={22} />
                <span className="min-w-0 flex-1 truncate">{person.name}</span>
                {person.sub ? <span className="truncate text-[12px] text-muted">{person.sub}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AwardForm({ initialUser, people, onDone }: { initialUser?: string; people: AwardPerson[]; onDone: () => void }) {
  const award = useAwardPoints();
  const [userId, setUserId] = useState(initialUser ?? "");
  const [amountText, setAmountText] = useState("10");
  const [reason, setReason] = useState(REASONS[0]);
  const [custom, setCustom] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const amountRef = useRef<HTMLInputElement>(null);

  const amount = Math.trunc(Number(amountText.replace(",", ".").replace("−", "-"))) || 0;
  const finalReason = custom.trim() || reason;
  const ready = Boolean(userId) && amount !== 0 && Boolean(finalReason) && !award.isPending;
  const submit = () => {
    if (!ready) return;
    // «Сказать в Эфире» is the praise's: a minus never goes to Эфир (D-133)
    award.mutate({ userId, amount, reason: finalReason, isPublic: amount > 0 && isPublic }, { onSuccess: onDone });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        // Ctrl/Cmd+Enter sends from anywhere in the form
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          submit();
        }
      }}
    >
      <div>
        <Label htmlFor="award-who">Кому</Label>
        <PersonPicker people={people} value={userId} onChange={setUserId} autoFocus={!initialUser} next={() => amountRef.current?.focus()} />
      </div>

      <div>
        <Label htmlFor="award-amount">Сколько</Label>
        <div className="flex items-center gap-2">
          <input
            id="award-amount"
            ref={amountRef}
            inputMode="numeric"
            value={amountText}
            data-autofocus={initialUser ? "" : undefined}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setAmountText(event.target.value.replace(/[^\d\-−]/g, ""))}
            onKeyDown={(event) => {
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              event.preventDefault();
              setAmountText(String(amount + (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1)));
            }}
            aria-label="Сумма очков"
            className="nums field h-9 w-24 px-3 text-right text-[14px] outline-none"
          />
          <span className="mr-1 text-[13px] text-muted">очков</span>
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmountText(String(preset))}
              className={`nums h-8 rounded-[9px] border px-2.5 text-[13px] font-semibold transition-colors duration-[120ms] ${
                amount === preset ? "border-accent/60 bg-accent/10 text-text" : "border-border text-muted hover:text-text"
              }`}
            >
              +{preset}
            </button>
          ))}
        </div>
        <span className="mt-1.5 block text-[12px] leading-4 text-muted">↑/↓ — по одному, Shift — по десять. Минус снимает очки — только с причиной, человек может оспорить</span>
      </div>

      <div>
        <Label htmlFor="award-reason">За что</Label>
        <div className="flex flex-wrap gap-1.5">
          {REASONS.map((item) => {
            const on = reason === item && !custom.trim();
            return (
              <button
                key={item}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setReason(item);
                  setCustom("");
                }}
                className={`h-8 rounded-[9px] border px-2.5 text-[13px] font-medium transition-colors duration-[120ms] ${on ? "border-accent/60 bg-accent/10 text-text" : "border-border text-muted hover:text-text"}`}
              >
                {item}
              </button>
            );
          })}
        </div>
        <input id="award-reason" value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Своя причина" aria-label="Своя причина" className="field mt-2 h-9 w-full px-3 text-[14px] leading-5 outline-none" />
      </div>

      {amount > 0 ? (
        <label className="flex cursor-pointer items-center gap-2.5 text-[14px] leading-5" data-testid="award-public">
          <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
          <span>
            Сказать в Эфире <span className="text-muted">· команда увидит похвалу, без пуша</span>
          </span>
        </label>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-1">
        <span className="mr-auto flex items-center gap-1 text-[12px] text-muted">
          <Kbd>Ctrl</Kbd>
          <Kbd>Enter</Kbd> начислить
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Отмена
        </Button>
        <Button type="submit" size="sm" loading={award.isPending} disabled={!ready} data-testid="award-submit">
          {amount >= 0 ? `Начислить +${amount}` : `Снять ${amount}`}
        </Button>
      </div>
    </form>
  );
}

/**
 * «Начислить» (D-48): a person, a sum and a reason in one dialog — the same RPC as the phone's
 * «Поощрить», idempotent by its request id. Opened from a person's row the person is chosen and the
 * caret waits in the sum; from the screen's button — in «Кому».
 */
export function AwardDialog({ target, people, onClose }: { target: AwardFor | null; people: AwardPerson[]; onClose: () => void }) {
  // the form stays on the card while the dialog fades out; every opening starts a fresh one
  const [shown, setShown] = useState<{ for: AwardFor; n: number } | null>(target ? { for: target, n: 0 } : null);
  if (target && target !== shown?.for) setShown({ for: target, n: (shown?.n ?? 0) + 1 });
  return (
    <Dialog open={target !== null} onClose={onClose} title="Начислить очки" width="sm">
      {shown ? <AwardForm key={shown.n} initialUser={shown.for.userId} people={people} onDone={onClose} /> : null}
    </Dialog>
  );
}
