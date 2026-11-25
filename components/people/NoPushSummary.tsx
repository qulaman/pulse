"use client";

import Link from "next/link";

import { canEditPerson, type Who } from "@/lib/people/access";
import { shortName, useNamesKey } from "@/lib/people/names";
import type { Person } from "@/lib/people/queries";
import { noPushPeople, type Health } from "@/lib/push/health";

/**
 * «Без уведомлений: Айгуль, Ерлан» over the roster (D-190): who hears about work only by opening
 * Pulse, the reason in the channel's own words (lib/push/health.ts), a tap on the person — their
 * card with «Прислать проверку»; on oneself — «Подключение». No «Напомнить»: a push would not
 * reach them. Nothing when everybody's pushes work.
 */
export function NoPushSummary({ people, push, me }: { people: readonly Person[]; push: Map<string, Health> | undefined; me: Who | null }) {
  // a namesake gets the surname's initial once the roster has come (D-146)
  useNamesKey();
  const deaf = noPushPeople(people, push);
  if (deaf.length === 0) return null;
  const byId = new Map(people.map((p) => [p.id, p]));

  return (
    <section className="mt-2 overflow-hidden rounded-[16px] border border-danger/40 bg-danger/10" data-testid="no-push-summary">
      <p className="px-4 pb-1 pt-3 text-[15px] leading-[21px]">
        <span className="font-semibold text-danger">Без уведомлений:</span> {deaf.map((d) => shortName(d.fullName)).join(", ")}
      </p>
      <ul>
        {deaf.map((d) => {
          const person = byId.get(d.id);
          const self = me?.id === d.id;
          const href = self ? "/setup?from=profile" : person && me && canEditPerson(me, person) ? `/people/${d.id}/edit` : null;
          const body = (
            <>
              <span className="min-w-0 flex-1 py-1.5">
                <span className="block text-[15px] leading-5">{shortName(d.fullName)}</span>
                <span className="block text-[13px] leading-4 text-muted">{self ? "это вы — откройте «Подключение»" : d.text}</span>
              </span>
              {href ? <span aria-hidden className="shrink-0 text-muted">›</span> : null}
            </>
          );
          return (
            <li key={d.id} className="border-t border-danger/20">
              {href ? (
                <Link href={href} className="flex min-h-[44px] items-center gap-2 px-4 transition-colors duration-[120ms] active:bg-danger/10">
                  {body}
                </Link>
              ) : (
                <div className="flex min-h-[44px] items-center gap-2 px-4">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="border-t border-danger/20 px-4 py-2 text-[12px] leading-4 text-muted">
        О задачах они узнают, только открыв Pulse. Попросите открыть на телефоне «Профиль» → «Подключение».
      </p>
    </section>
  );
}
