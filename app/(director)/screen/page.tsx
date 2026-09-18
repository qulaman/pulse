"use client";

import { useEffect, useState } from "react";

import { PersonPick } from "@/components/screen/PersonPick";
import { Dot, Gauge, Key, Lcd, LcdDim, Lens, RemoteBody, Switch, type LedTone } from "@/components/screen/Remote";
import { ScreenPageSkeleton } from "@/components/screen/RemoteSkeleton";
import { toast } from "@/components/ui/Toast";
import { usePeople } from "@/lib/people/queries";
import { tvTime } from "@/lib/tv/clock";
import { useTvControl } from "@/lib/tv/mutations";
import { useTvState } from "@/lib/tv/queries";
import { SCENE_LABEL, wallNow, wallReceipt } from "@/lib/tv/remote";
import { effectiveMode, FOCUS_MS, focusRemainingMs, guestOf, sceneOf, TV_SCENES, type TvScene } from "@/lib/tv/state";

/**
 * «Экран в кабинете» — пульт от телевизора в кармане директора (D-76 §10).
 *
 * Жест, ради которого он существует: сотрудник зашёл в кабинет — директор нажал
 * его имя — на стене в коридоре его дела (CONCEPT §9, демо-сцена продажи). Поэтому
 * список людей идёт сразу под пультом и работает в один тап, без листа подтверждения.
 *
 * Сам пульт собран как устройство: линза с диодом-квитанцией, дисплей «что на стене»,
 * резиновые клавиши и ползунок. Директор не видит телевизор из кабинета и обязан узнать
 * от пульта, дошла команда или экран висит со вчера (принцип 8 для ТВ): диод мигает,
 * пока команда летит, горит зелёным, когда стена показала, жёлтым — когда экран молчит.
 * Оффлайн-очереди у пульта нет: без сети клавиша честно говорит «нет связи» (D-76 §3).
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

  if (state.isLoading || people.isLoading) return <ScreenPageSkeleton />;

  const row = state.data ?? null;
  const mode = effectiveMode(row, now);
  const scene = sceneOf(row);
  const guest = guestOf(row, false);
  const receipt = wallReceipt(row, now);
  const remainingMs = focusRemainingMs(row, now);
  const onScreenId = mode === "employee" ? row?.employee_id ?? null : null;
  // экран ни разу не поднимался: сначала объясняем, как его завести, потом команды
  const neverSeen = !row?.seen_at;
  // диод мигает, пока команда в пути: от нажатия до того, как киоск отметил её показанной
  const inFlight = control.isPending || (receipt.tone === "muted" && !neverSeen);
  const led: LedTone = inFlight ? "accent" : neverSeen ? "off" : receipt.tone;

  const show = (input: Parameters<typeof control.mutate>[0], message: string) => {
    control.mutate(input, { onSuccess: () => toast(message) });
  };

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Экран в кабинете</h1>
      <p className="mt-1 text-[13px] leading-[18px] text-muted">
        Пульт от телевизора: что сейчас на стене и что показать
      </p>

      <RemoteBody className="mx-auto mt-4 w-full max-w-[380px]">
        <Lens tone={led} blink={inFlight} />

        <Lcd className="mt-3">
          <div className="flex items-center justify-between gap-3">
            <LcdDim className="font-display text-[11px] font-semibold uppercase leading-4 tracking-[0.1em]">
              {neverSeen ? "Экран" : "Сейчас на стене"}
            </LcdDim>
            <LcdDim className="nums text-[12px] leading-4">{tvTime(now)}</LcdDim>
          </div>
          {neverSeen ? (
            <>
              <p className="mt-2 font-display text-[19px] font-bold leading-6 tracking-[-0.02em]">Ещё не подключался</p>
              <LcdDim className="mt-1 block text-[13px] leading-[18px]">
                Войди на телевизоре под пользователем роли «ТВ-экран» — и он появится здесь
              </LcdDim>
            </>
          ) : (
            <>
              <p className="mt-2 truncate font-display text-[21px] font-bold leading-7 tracking-[-0.02em]">
                {wallNow(row, people.data ?? [], now)}
              </p>
              <p className="mt-1 text-[13px] leading-[18px]" style={{ color: RECEIPT_COLOR[receipt.tone] }}>
                {receipt.text}
              </p>
              {mode === "employee" ? (
                <div className="mt-3">
                  <Gauge ratio={remainingMs / FOCUS_MS} />
                </div>
              ) : null}
            </>
          )}
        </Lcd>

        <div className="mt-3 flex items-stretch gap-2">
          <Key
            icon={<EtherIcon />}
            disabled={mode !== "employee"}
            onClick={() => show({ mode: "ether" }, "Вернул эфир")}
          >
            Вернуть эфир
          </Key>
          <Key
            round
            icon={<RefreshIcon />}
            aria-label="Перезапустить экран"
            onClick={() => show({ reload: true }, "Экран перезапускается")}
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {TV_SCENES.map((value) => (
            <Key
              key={value}
              tall
              on={scene === value}
              icon={SCENE_ICON[value]}
              onClick={() => {
                if (scene !== value) show({ scene: value }, `Заставка: ${SCENE_LABEL[value].toLowerCase()}`);
              }}
            >
              {SCENE_LABEL[value]}
            </Key>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {TV_SCENES.map((value) => (
            <span key={value} className="flex justify-center">
              <Dot on={scene === value} />
            </span>
          ))}
        </div>
        <p className="mt-2 px-1 text-center text-[13px] leading-[18px] text-muted">{SCENE_HINT[scene]}</p>

        <div className="mt-3">
          <Switch
            on={guest}
            icon={<VisitorIcon />}
            title="Посетитель"
            value={guest ? "без фамилий, очков и названий" : "выключен"}
            onToggle={(next) => show({ guest: next }, next ? "Посетитель включён" : "Посетитель выключен")}
          />
        </div>
      </RemoteBody>

      <h2 className="eyebrow mt-6 px-1">Кого показать</h2>
      <div className="mt-2">
        <PersonPick
          people={people.data ?? []}
          onScreenId={onScreenId}
          remainingMinutes={Math.ceil(remainingMs / 60_000)}
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
    </main>
  );
}

const icon = {
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

const EtherIcon = () => (
  <svg {...icon}>
    <circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" />
    <path d="M6.5 13.5a5 5 0 0 1 0-7M13.5 6.5a5 5 0 0 1 0 7" />
    <path d="M4 16a8.5 8.5 0 0 1 0-12M16 4a8.5 8.5 0 0 1 0 12" />
  </svg>
);

const RefreshIcon = () => (
  <svg {...icon}>
    <path d="M16.4 8.4A6.6 6.6 0 1 0 16 12.4" />
    <path d="M16.8 4.2v4.4h-4.4" />
  </svg>
);

const VisitorIcon = () => (
  <svg {...icon}>
    <circle cx="10" cy="7" r="3.2" />
    <path d="M3.8 16.6c0-3 2.8-4.8 6.2-4.8s6.2 1.8 6.2 4.8" />
  </svg>
);

const SCENE_ICON: Record<TvScene, React.ReactNode> = {
  face: (
    <svg {...icon}>
      <circle cx="10" cy="10" r="7" />
      <path d="M7.2 8.2h.01M12.8 8.2h.01" strokeWidth="2.2" />
      <path d="M7 12a3.6 3.6 0 0 0 6 0" />
    </svg>
  ),
  clock: (
    <svg {...icon}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4.2l2.8 1.6" />
    </svg>
  ),
  team: (
    <svg {...icon}>
      <circle cx="7.2" cy="7.5" r="2.6" />
      <circle cx="13.6" cy="8.2" r="2.1" />
      <path d="M2.6 16c0-2.6 2.1-4.2 4.6-4.2s4.6 1.6 4.6 4.2" />
      <path d="M12.6 15.6h4.8c0-2.2-1.6-3.6-3.8-3.6" />
    </svg>
  ),
};
