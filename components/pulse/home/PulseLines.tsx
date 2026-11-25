"use client";

import Link from "next/link";
import { memo } from "react";

import { SetupEntry } from "@/components/setup/SetupEntry";
import { Button } from "@/components/ui/Button";

import type { Exchange } from "./useQuestionExchange";

/**
 * The service lines (a draft not sent, nobody in the team yet, the phone not set up): under the
 * band's words on the ring, under the open ball in the card. Their own part — a tap does not touch them (D-178).
 * The phone is one line into «Подключение» (D-190) where the push and install cards were — `setup`
 * false leaves it out: the card shows it under «Дела» only, not under every ball.
 */
export const ServiceLines = memo(function ServiceLines({ draftCount, noTeam, setup = true }: { draftCount: number; noTeam: boolean; setup?: boolean }) {
  return (
    <>
      {draftCount > 0 ? (
        <Link href="/confirm" className="card-in relative block py-1 pl-4 text-[15px] leading-5">
          <span aria-hidden className="absolute left-0 top-[8px] h-2 w-2 rounded-full bg-accent" />
          Черновик: {draftCount} {draftCount === 1 ? "сущность" : draftCount < 5 ? "сущности" : "сущностей"}, не отправлен.{" "}
          <span className="text-accent">Открыть ›</span>
        </Link>
      ) : null}
      {noTeam ? (
        <Link href="/people/new" className="card-in relative block py-1 pl-4 text-[15px] leading-5">
          <span aria-hidden className="absolute left-0 top-[8px] h-2 w-2 rounded-full bg-accent" />
          В команде пока никого. Добавьте первого сотрудника. <span className="text-accent">Добавить ›</span>
        </Link>
      ) : null}
      {setup ? <SetupEntry from="pulse" /> : null}
    </>
  );
});

/**
 * The ways out of «не разобрал», right under the words (the same three as /confirm): fix the
 * words in the typed input and parse again, make them a task by hand, or drop them.
 */
export function UnparsedButtons({ onFix, onManual, onClose }: { onFix: () => void; onManual: () => void; onClose: () => void }) {
  return (
    <div className="card-in flex flex-wrap justify-center gap-2 pt-1" data-testid="unparsed-actions">
      <Button className="!min-h-[40px] !px-4 !text-[14px]" onClick={onFix}>
        Исправить текст
      </Button>
      <Button variant="secondary" className="!min-h-[40px] !px-4 !text-[14px]" onClick={onManual}>
        Сделать задачей
      </Button>
      <Button variant="ghost" className="!min-h-[40px] !px-3 !text-[14px]" onClick={onClose}>
        Закрыть
      </Button>
    </div>
  );
}

/** The ways out of an answer: an answer not understood can still become a task by hand. */
export function ExchangeButtons({ exchange, onManual, onClose }: { exchange: Exchange; onManual: () => void; onClose: () => void }) {
  return (
    <div className="card-in flex flex-wrap justify-center gap-2 pt-1">
      {!exchange.understood ? (
        <Button variant="secondary" className="!min-h-[40px] !px-4 !text-[14px]" onClick={onManual}>
          Сделать задачей
        </Button>
      ) : null}
      <Button variant="ghost" className="!min-h-[40px] !px-3 !text-[14px]" onClick={onClose}>
        Закрыть
      </Button>
    </div>
  );
}
