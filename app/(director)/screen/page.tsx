"use client";

import { useEffect, useState } from "react";

import { PersonPick } from "@/components/screen/PersonPick";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ScreenSkeleton } from "@/components/ui/PageSkeletons";
import { Row, RowGroup } from "@/components/ui/Row";
import { toast } from "@/components/ui/Toast";
import { usePeople } from "@/lib/people/queries";
import { useTvControl } from "@/lib/tv/mutations";
import { useTvState } from "@/lib/tv/queries";
import { SCENE_LABEL, wallNow, wallReceipt } from "@/lib/tv/remote";
import { effectiveMode, guestOf, sceneOf, TV_SCENES, type TvScene } from "@/lib/tv/state";

/**
 * «Экран в кабинете» — пульт от телевизора в кармане директора (D-76 §10).
 *
 * Жест, ради которого он существует: сотрудник зашёл в кабинет — директор нажал
 * его имя — на стене в коридоре его дела (CONCEPT §9, демо-сцена продажи). Поэтому
 * список людей стоит вторым блоком и работает в один тап, без листа подтверждения.
 *
 * Первым блоком — «Сейчас на стене» с квитанцией: директор не видит телевизор из
 * кабинета и обязан узнать от пульта, дошла команда или экран висит со вчера
 * (принцип 8 для ТВ). Оффлайн-очереди у пульта нет: без сети кнопка честно говорит
 * «нет связи», а не обещает переключить экран когда-нибудь (D-76 §3).
 */

const SCENE_HINT: Record<TvScene, string> = {
  face: "Лицо говорит о последних событиях",
  clock: "Тихие часы: для совещаний",
  team: "Кто чем занят",
};

const RECEIPT_COLOR = { ok: "var(--ok)", warn: "var(--warn)", muted: "var(--text-muted)" } as const;

/** «ещё N мин» должно таять само: раз в 10 секунд достаточно, минута не опоздает. */
function useTick(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export default function ScreenPage() {
  const now = useTick();
  const state = useTvState();
  const people = usePeople();
  const control = useTvControl();

  if (state.isLoading || people.isLoading) return <ScreenSkeleton />;

  const row = state.data ?? null;
  const mode = effectiveMode(row, now);
  const scene = sceneOf(row);
  const guest = guestOf(row, false);
  const receipt = wallReceipt(row, now);
  const onScreenId = mode === "employee" ? row?.employee_id ?? null : null;
  // экран ни разу не поднимался: сначала объясняем, как его завести, потом команды
  const neverSeen = !row?.seen_at;

  const show = (input: Parameters<typeof control.mutate>[0], message: string) => {
    control.mutate(input, { onSuccess: () => toast(message) });
  };

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Экран в кабинете</h1>
      <p className="mt-1 text-[13px] leading-[18px] text-muted">
        Пульт от телевизора: что сейчас на стене и что показать
      </p>

      <section className="mt-4 card p-4">
        {neverSeen ? (
          <>
            <p className="text-[19px] font-semibold leading-6">Экран ещё не подключался</p>
            <p className="mt-1 text-[14px] leading-[19px] text-muted">
              Войди на телевизоре под пользователем роли «ТВ-экран» — и он появится здесь
            </p>
          </>
        ) : (
          <>
            <p className="text-[22px] font-bold leading-[28px]">{wallNow(row, people.data ?? [], now)}</p>
            <p className="mt-1 text-[13px] leading-[18px]" style={{ color: RECEIPT_COLOR[receipt.tone] }}>
              {receipt.text}
            </p>
            {mode === "employee" ? (
              <Button
                className="mt-3"
                variant="secondary"
                loading={control.isPending}
                onClick={() => show({ mode: "ether" }, "Вернул эфир")}
              >
                Вернуть эфир
              </Button>
            ) : null}
          </>
        )}
      </section>

      <h2 className="eyebrow mt-6 px-1">Показать сотрудника</h2>
      <div className="mt-2">
        <PersonPick
          people={people.data ?? []}
          onScreenId={onScreenId}
          onPick={(person) =>
            show(
              { mode: "employee", employeeId: person.id },
              person.id === onScreenId
                ? "Ещё 10 минут"
                : `На стене — ${person.full_name.split(/\s+/)[0]} · 10 мин`,
            )
          }
        />
      </div>

      <h2 className="eyebrow mt-6 px-1">Заставка</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {TV_SCENES.map((value) => (
          <Chip
            key={value}
            tone={scene === value ? "accent" : "neutral"}
            onClick={() => show({ scene: value }, `Заставка: ${SCENE_LABEL[value].toLowerCase()}`)}
          >
            {SCENE_LABEL[value]}
          </Chip>
        ))}
      </div>
      <p className="mt-2 px-1 text-[13px] leading-[18px] text-muted">{SCENE_HINT[scene]}</p>

      <h2 className="eyebrow mt-6 px-1">Режим</h2>
      <RowGroup className="mt-2">
        <Row
          icon={<VisitorIcon />}
          tone={guest ? "gold" : "muted"}
          title="Посетитель"
          value={guest ? "включён: без фамилий, очков и названий" : "выключен"}
          valueColor={guest ? "var(--warn)" : undefined}
          busy={control.isPending}
          onClick={() => show({ guest: !guest }, guest ? "Посетитель выключен" : "Посетитель включён")}
        />
        <Row
          icon={<RefreshIcon />}
          tone="muted"
          title="Перезапустить экран"
          // пустое значение, а не «если завис»: на 320 px подпись съедала имя действия
          value=""
          busy={control.isPending}
          onClick={() => show({ reload: true }, "Экран перезапускается")}
        />
      </RowGroup>
      {guest ? (
        <p className="mt-2 px-1 text-[13px] leading-[18px] text-muted">
          На стене нет фамилий, очков и названий — только имена и слово «Поручение»
        </p>
      ) : null}
    </main>
  );
}

const VisitorIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="10" cy="7" r="3.2" />
    <path d="M3.8 16.6c0-3 2.8-4.8 6.2-4.8s6.2 1.8 6.2 4.8" />
  </svg>
);

const RefreshIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M16.4 8.4A6.6 6.6 0 1 0 16 12.4" />
    <path d="M16.8 4.2v4.4h-4.4" />
  </svg>
);
