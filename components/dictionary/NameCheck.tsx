"use client";

import { useState } from "react";

import { PeoplePicker } from "@/components/people/PeoplePicker";
import { toast } from "@/components/ui/Toast";
import type { MatchingConfig } from "@/lib/ai/config";
import { checkName, ownersOf, planAliases, type RosterPerson } from "@/lib/dictionary";
import { useEditAliases } from "@/lib/dictionary-queries";
import { initialAlias } from "@/lib/people/aliases";
import { firstNameOf } from "@/lib/text/normalize";

const TONE = { sure: "var(--ok)", check: "var(--warn)", ask: "var(--warn)", none: "var(--danger)" } as const;

/**
 * «Проверить имя» (D-111): the spoken form in, what the name matcher makes of it out —
 * the same `matchName` the pipeline runs after the model, with the company's thresholds.
 * It shows the floor, not the ceiling: the model may still read an unknown form right,
 * so «не узнает» is phrased as «угадывать будет модель». A form it does not know goes
 * to a person in two taps — the app's one people picker (D-108) — but only where an alias
 * would settle it (`teach`): on a bare first name two people share the matcher asks
 * «кого?» whatever the aliases say.
 */
export function NameCheck({
  people,
  matching,
  lockedIds,
  onAdded,
}: {
  people: RosterPerson[];
  matching?: Partial<MatchingConfig>;
  /** People this viewer may not edit — not offered in the picker. */
  lockedIds: readonly string[];
  onAdded: (id: string, entries: string[]) => void;
}) {
  const edit = useEditAliases();
  const [spoken, setSpoken] = useState("");
  const [picking, setPicking] = useState(false);
  const result = checkName(spoken, people, matching);
  const form = spoken.replace(/\s+/g, " ").trim();
  // why it asks: namesakes want an initial; a nickname given to two wants taking from one
  const namesakes =
    result?.kind === "ask" && new Set(result.people.map((p) => firstNameOf(p).toLowerCase())).size === 1;
  const sharedForm = result?.kind === "ask" && ownersOf(form, people).length > 1;

  const give = (id: string) => {
    const person = people.find((p) => p.id === id);
    if (!person) return;
    const plan = planAliases(person, form, people);
    if (!plan.add.length) {
      toast(plan.fullName ? "Полное имя ИИ уже знает" : plan.existing.length ? "Это имя у человека уже есть" : "Так имя не добавить");
      return;
    }
    edit.mutate({ id, add: plan.add });
    onAdded(id, plan.add);
    toast(`«${plan.add[0]}» — теперь ${person.full_name}`);
  };

  return (
    <section className="card px-4 py-4">
      <h2 className="font-display text-[17px] font-semibold leading-[22px] tracking-[-0.01em]">Проверить имя</h2>
      <p className="mt-0.5 text-[13px] leading-[18px] text-muted">Впишите, как говорите вслух — в любом падеже</p>
      <input
        type="search"
        value={spoken}
        onChange={(e) => setSpoken(e.target.value)}
        placeholder="Например, «Ерлану» или «Жаке»"
        aria-label="Имя, как в речи"
        autoCapitalize="words"
        className="mt-3 min-h-[44px] w-full field px-3 text-[16px] leading-[22px] outline-none transition-colors duration-[120ms] placeholder:text-muted focus:border-accent"
      />
      {result ? (
        <div role="status" className="card-in mt-3 flex gap-2.5">
          <span aria-hidden className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: TONE[result.kind] }} />
          <p className="min-w-0 flex-1 text-[15px] leading-[21px]">
            {result.kind === "sure" ? (
              <>
                <b className="font-semibold">{result.person}</b> — узнает сразу
              </>
            ) : result.kind === "check" ? (
              <>
                Похоже на <b className="font-semibold">{result.person}</b>, но попросит проверить.{" "}
                <span className="text-muted">Добавьте эту форму в имена человека — будет узнавать сразу.</span>
              </>
            ) : result.kind === "ask" ? (
              <>
                Спросит, кого: {result.people.map((p, i) => (
                  <span key={p}>
                    {i ? " или " : ""}
                    <b className="font-semibold">{p}</b>
                  </span>
                ))}
                .{" "}
                {namesakes && initialAlias(result.people[0] ?? "") ? (
                  <span className="text-muted">
                    Чтобы не спрашивал, говорите с инициалом: «{initialAlias(result.people[0] ?? "")}».
                  </span>
                ) : sharedForm ? (
                  <span className="text-muted">Так зовут нескольких — уберите это имя у тех, кого так не называете.</span>
                ) : null}
              </>
            ) : (
              <>
                По словарю не узнает — угадывать будет модель.{" "}
                <span className="text-muted">Надёжнее добавить эту форму нужному человеку.</span>
              </>
            )}
          </p>
        </div>
      ) : null}
      {result && result.kind !== "sure" && result.teach ? (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="card-in mt-2 min-h-[40px] pl-[18px] text-left font-display text-[14px] font-semibold leading-[18px] text-accent"
        >
          Добавить «{form}» человеку…
        </button>
      ) : null}

      <PeoplePicker
        open={picking}
        onClose={() => setPicking(false)}
        title="Кого вы так называете?"
        subject={form}
        hint="Сохраню как есть — поэтому пишите так, как отвечают на вопрос «кто?»"
        suggestedIds={people
          .filter((p) =>
            result?.kind === "check" ? p.full_name === result.person : result?.kind === "ask" ? result.people.includes(p.full_name) : false,
          )
          .map((p) => p.id)}
        hideIds={lockedIds}
        onPick={(person) => {
          setPicking(false);
          give(person.id);
        }}
      />
    </section>
  );
}
