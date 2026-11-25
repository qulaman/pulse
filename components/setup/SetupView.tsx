"use client";

import { motion } from "motion/react";
import { useState, type ReactNode } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { MicCheck, type MicOutcome } from "@/components/setup/MicCheck";
import type { SetupModel } from "@/components/setup/useSetup";
import { Button } from "@/components/ui/Button";
import { PageHead } from "@/components/ui/PageHead";
import { pushBlocker } from "@/lib/push/words";
import { springs } from "@/lib/design/tokens";
import { currentStep, micAdvice, progressLabel, pushAdvice, resolved, type Step, type StepId, type StepState } from "@/lib/setup/steps";

const TITLE: Record<StepId, string> = {
  install: "На главный экран",
  push: "Уведомления",
  test: "Пробное уведомление",
  mic: "Микрофон",
};

const STATE_COLOR: Record<StepState, string> = {
  done: "var(--ok)",
  todo: "var(--text-muted)",
  skipped: "var(--text-muted)",
  blocked: "var(--text-muted)",
  checking: "var(--text-muted)",
};

/** The step's state in two or three words, under its title. */
function statusOf(step: Step, standalone: boolean): { text: string; color: string } {
  const color = STATE_COLOR[step.state];
  if (step.state === "skipped") return { text: step.why === "desktop" ? "для телефона" : "пропущено", color };
  if (step.state === "checking") return { text: "проверяю…", color };
  switch (step.id) {
    case "install":
      return step.state === "done" ? { text: standalone ? "открыт с главного экрана" : "установлен", color } : { text: "сделать", color: "var(--accent)" };
    case "push":
      if (step.state === "done") return { text: "включены", color };
      if (step.why === "denied") return { text: "запрещены", color: "var(--danger)" };
      if (step.why === "broken") return { text: "последний не дошёл", color: "var(--danger)" };
      if (step.why === "device-off") return { text: "выключены здесь", color: "var(--warn)" };
      if (step.why === "resubscribe") return { text: "не подключены", color: "var(--warn)" };
      if (step.why === "ios-tab") return { text: "после главного экрана", color };
      if (step.why === "unsupported") return { text: "браузер не умеет", color: "var(--warn)" };
      if (step.why === "no-keys") return { text: "не настроены", color: "var(--warn)" };
      return { text: "включить", color: "var(--accent)" };
    case "test":
      if (step.state === "done") return { text: "приходят", color };
      if (step.state === "blocked") return { text: "после уведомлений", color };
      return { text: "проверить", color: "var(--accent)" };
    case "mic":
      if (step.state === "done") return { text: "работает", color };
      if (step.why === "denied") return { text: "запрещён", color: "var(--danger)" };
      if (step.why === "unsupported") return { text: "недоступен", color: "var(--warn)" };
      return { text: "проверить", color: "var(--accent)" };
  }
}

/**
 * The step's ring, in the grammar of the task glyphs: empty — to do, a disc — done, dashed —
 * skipped; «!» only where this phone cannot do it at all — a step waiting for the one before is quiet.
 */
function Glyph({ state, current, cannot }: { state: StepState; current: boolean; cannot: boolean }) {
  if (state === "done") {
    return (
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden className="shrink-0">
        <circle cx="13" cy="13" r="11" fill="var(--ok)" />
        <path d="m8.5 13.3 3 3 6-6.3" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const stroke = cannot ? "var(--warn)" : current && state !== "blocked" ? "var(--accent)" : "var(--border)";
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden className="shrink-0">
      <circle
        cx="13"
        cy="13"
        r="10"
        fill="none"
        stroke={state === "skipped" ? "var(--text-muted)" : stroke}
        strokeWidth="2"
        strokeDasharray={state === "skipped" ? "3 3.3" : undefined}
        opacity={state === "checking" ? 0.5 : 1}
      />
      {current && state !== "blocked" ? <circle cx="13" cy="13" r="3.5" fill="var(--accent)" /> : null}
      {cannot ? <path d="M13 8.5v5.2M13 17.2v.1" stroke="var(--warn)" strokeWidth="2.2" strokeLinecap="round" /> : null}
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden
      className="shrink-0 text-muted transition-transform duration-150 ease-out"
      style={{ transform: open ? "rotate(90deg)" : undefined }}
    >
      <polyline points="6,3.5 10.5,8 6,12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Safari's «Поделиться», as on the sign-in's «Сначала — на главный экран». */
function ShareGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" className="inline-block align-[-3px]" aria-hidden>
      <path d="M10 2.5v10M6.5 6 10 2.5 13.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 9H5a1 1 0 0 0-1 1v6.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1h-1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-[21px] text-muted">{children}</p>;
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-2.5 text-[15px] leading-[21px]">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="nums mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold">{i + 1}</span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Warn({ children }: { children: ReactNode }) {
  return <p className="rounded-[12px] border border-warn/40 bg-warn/10 px-3 py-2 text-[14px] leading-[19px] text-warn">{children}</p>;
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

type Props = {
  model: SetupModel;
  /** «Позже» / «Назад» */
  onLeave: () => void;
  /** «На Пульс» once everything is through */
  onHome: () => void;
  /** the self-issued sign-in code for the home-screen app; absent — the button is not shown */
  onCode?: () => void;
};

/**
 * «Подключение» (D-190): four steps from a link to «Pulse on the home screen, pushes arrive» — the
 * home screen, notifications, a test push with «Пришло?», the microphone — each with its state
 * («готово / сделать / пропущено»), the first one not through open. A messenger's own browser gets
 * one request instead: open it in a real browser. Everything can wait («Позже»); the screen itself
 * is the model's view, so the sandbox (/dev/setup) draws it on made-up phones.
 */
export function SetupView({ model, onLeave, onHome, onCode }: Props) {
  const { facts, steps, progress } = model;
  // the step the person opened or closed by hand; null — the first one not through is open
  const [picked, setPicked] = useState<StepId | "none" | null>(null);
  const current = currentStep(steps);
  const open = picked === null ? current : picked === "none" ? null : picked;
  const toggle = (id: StepId) => setPicked(open === id ? "none" : id);
  // a step went through: the next one opens
  const moveOn = () => setPicked(null);

  const head = progress.complete ? "Телефон готов" : `${progressLabel(progress)} готово`;
  const desktop = facts.platform === "other";
  const tone = facts.inApp !== null ? "warn" : progress.complete ? "ok" : desktop ? "muted" : "accent";

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-16" data-testid="setup-screen">
      <PageHead
        title="Подключение"
        back={{ label: progress.complete ? "Назад" : "Позже", onClick: onLeave, testId: "setup-leave" }}
        tone={tone}
        state={facts.inApp !== null ? "нужен обычный браузер" : desktop ? "для телефона" : head}
      />

      {facts.inApp !== null ? (
        <InAppCard name={facts.inApp} ios={facts.platform === "ios"} />
      ) : desktop ? (
        <section className="card mt-4 px-4 py-4">
          <Lead>Подключение — для телефона: там Pulse встанет на главный экран и будет присылать уведомления. Откройте Pulse на телефоне и зайдите в «Профиль» → «Подключение».</Lead>
        </section>
      ) : (
        <>
          {progress.complete ? null : (
            <p className="mt-3 px-1 text-[15px] leading-[21px] text-muted">
              Четыре шага — и {model.team ? "поручения" : "ответы команды"} будут приходить на телефон, даже когда Pulse закрыт. Любой шаг можно пропустить.
            </p>
          )}
          <ol className="mt-4 flex flex-col gap-2">
            {steps.map((step) => (
              <StepCard
                key={step.id}
                step={step}
                open={open === step.id}
                current={current === step.id}
                onToggle={() => toggle(step.id)}
                model={model}
                onCode={onCode}
                moveOn={moveOn}
                pin={() => setPicked(step.id)}
              />
            ))}
          </ol>
          {progress.complete ? <DoneCard team={model.team} onHome={onHome} /> : null}
        </>
      )}
    </main>
  );
}

function StepCard({
  step,
  open,
  current,
  onToggle,
  model,
  onCode,
  moveOn,
  pin,
}: {
  step: Step;
  open: boolean;
  current: boolean;
  onToggle: () => void;
  model: SetupModel;
  onCode?: () => void;
  moveOn: () => void;
  /** keep this step open whatever its state becomes (the microphone says «слышу» and stays) */
  pin: () => void;
}) {
  const status = statusOf(step, model.facts.standalone);
  return (
    <motion.li layout="position" transition={springs.object} className="card overflow-hidden" data-step={step.id} data-state={step.state}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[120ms] active:bg-surface-2"
      >
        <Glyph state={step.state} current={current} cannot={step.state === "blocked" && (step.why === "unsupported" || step.why === "no-keys")} />
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium leading-[22px]">{TITLE[step.id]}</span>
          <span className="block truncate text-[13px] leading-4" style={{ color: status.color }}>
            {status.text}
          </span>
        </span>
        <Chevron open={open} />
      </button>
      {open ? (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
          className="flex flex-col gap-3 px-4 pb-4"
        >
          {step.id === "install" ? <InstallBody step={step} model={model} onCode={onCode} moveOn={moveOn} /> : null}
          {step.id === "push" ? <PushBody step={step} model={model} moveOn={moveOn} /> : null}
          {step.id === "test" ? <TestBody step={step} model={model} moveOn={moveOn} /> : null}
          {step.id === "mic" ? <MicBody step={step} model={model} moveOn={moveOn} pin={pin} /> : null}
        </motion.div>
      ) : null}
    </motion.li>
  );
}

function SkipButton({ step, model, moveOn }: { step: Step; model: SetupModel; moveOn: () => void }) {
  if (resolved(step)) return null;
  return (
    <Button
      variant="ghost"
      className="!px-3"
      onClick={() => {
        model.actions.skip(step.id);
        moveOn();
      }}
      data-testid={`setup-skip-${step.id}`}
    >
      Пропустить
    </Button>
  );
}

function InstallBody({ step, model, onCode, moveOn }: { step: Step; model: SetupModel; onCode?: () => void; moveOn: () => void }) {
  const { facts, actions } = model;
  if (step.state === "done") {
    return <Lead>{facts.standalone ? "Pulse открыт как приложение — без адресной строки." : "Pulse на главном экране. Открывайте его оттуда — как приложение."}</Lead>;
  }
  if (facts.platform === "ios") {
    return (
      <>
        <Lead>На iPhone уведомления приходят только в приложении с экрана «Домой».</Lead>
        <Steps
          items={[
            <>
              Внизу Safari — «Поделиться» <ShareGlyph />
            </>,
            "«На экран „Домой“» → «Добавить»",
            "Откройте Pulse с экрана «Домой» и продолжите там",
          ]}
        />
        {onCode ? (
          <p className="text-[13px] leading-[18px] text-muted">
            Вход в приложении — отдельный от Safari. Код для него можно взять здесь:{" "}
            <button type="button" onClick={onCode} className="text-accent underline underline-offset-4" data-testid="setup-code">
              код для входа
            </button>
          </p>
        ) : null}
        <Actions>
          <SkipButton step={step} model={model} moveOn={moveOn} />
        </Actions>
      </>
    );
  }
  if (facts.installOffer) {
    return (
      <>
        <Lead>Pulse откроется как приложение, без адресной строки, и уведомления будут приходить от его имени, а не от {facts.browser}.</Lead>
        <Actions>
          <Button onClick={() => void actions.install().then(moveOn)} data-testid="setup-install">
            Установить
          </Button>
          <SkipButton step={step} model={model} moveOn={moveOn} />
        </Actions>
      </>
    );
  }
  return (
    <>
      <Lead>В меню браузера «⋮» — «Добавить на главный экран» или «Установить приложение». Если Pulse уже там — откройте его с главного экрана.</Lead>
      <Actions>
        <Button
          variant="secondary"
          onClick={() => {
            actions.markInstalled();
            moveOn();
          }}
          data-testid="setup-installed"
        >
          Уже на главном экране
        </Button>
        <SkipButton step={step} model={model} moveOn={moveOn} />
      </Actions>
    </>
  );
}

function PushBody({ step, model, moveOn }: { step: Step; model: SetupModel; moveOn: () => void }) {
  const { facts, actions, pushBusy } = model;
  const enable = (label: string) => (
    <Button loading={pushBusy} onClick={() => void actions.enablePush().then(moveOn)} data-testid="setup-push">
      {label}
    </Button>
  );
  if (step.state === "done") return <Lead>Уведомления на этом телефоне включены.</Lead>;
  if (step.state === "checking") return <Lead>Проверяю, знает ли сервер этот телефон…</Lead>;

  let body: ReactNode;
  let button: ReactNode = null;
  switch (step.why) {
    case "denied":
      body = <Warn>{pushBlocker("denied", { platform: facts.platform, standalone: facts.standalone })}</Warn>;
      break;
    case "resubscribe":
      body = <Lead>Разрешение есть, но этот телефон не подключён к рассылке.</Lead>;
      button = enable("Подключить");
      break;
    case "broken":
      body = <Lead>Последнее уведомление до этого телефона не дошло. Подключите его заново.</Lead>;
      button = enable("Подключить заново");
      break;
    case "device-off":
      body = <Lead>Уведомления на это устройство выключены в списке устройств: «Профиль» → «Уведомления».</Lead>;
      break;
    case "ios-tab":
      body = <Lead>Сначала — на экран «Домой»: на iPhone уведомления приходят только в приложении оттуда.</Lead>;
      break;
    case "unsupported":
      body = (
        <Lead>
          {facts.platform === "ios"
            ? "Этот iPhone не умеет уведомления от приложений с экрана «Домой» — нужна iOS 16.4 или новее."
            : "Этот браузер не умеет уведомления — откройте Pulse в Chrome."}
        </Lead>
      );
      break;
    case "no-keys":
      body = <Lead>Уведомления ещё не настроены на сервере — сообщите директору.</Lead>;
      break;
    default:
      body = <Lead>Задача придёт на телефон, даже когда Pulse закрыт. Телефон спросит разрешение — нажмите «Разрешить».</Lead>;
      button = enable("Включить уведомления");
  }
  return (
    <>
      {body}
      <Actions>
        {button}
        <SkipButton step={step} model={model} moveOn={moveOn} />
      </Actions>
    </>
  );
}

function TestBody({ step, model, moveOn }: { step: Step; model: SetupModel; moveOn: () => void }) {
  const { facts, actions, test } = model;
  const [answer, setAnswer] = useState<"no" | null>(null);
  if (step.state === "blocked" || step.state === "checking") {
    return (
      <>
        <Lead>Сначала включите уведомления — потом пришлю пробное.</Lead>
        <Actions>
          <SkipButton step={step} model={model} moveOn={moveOn} />
        </Actions>
      </>
    );
  }
  const verdict = test.verdict;
  const advice = answer === "no" || verdict?.cause === "late" ? pushAdvice(facts.maker, facts.browser) : null;
  const verdictColor = verdict?.tone === "ok" ? "var(--ok)" : verdict?.tone === "warn" ? "var(--danger)" : "var(--text-muted)";
  const send = () => {
    setAnswer(null);
    actions.sendTest();
  };

  return (
    <>
      {step.state === "done" && !verdict ? <Lead>Пробное уведомление пришло на этот телефон.</Lead> : null}
      {!verdict && step.state !== "done" ? <Lead>Пришлю пробное уведомление — посмотрите, появится ли оно на экране.</Lead> : null}
      {verdict ? (
        <p className="text-[14px] leading-[19px]" style={{ color: verdictColor }} role="status" data-testid="setup-verdict">
          {verdict.text}
        </p>
      ) : null}

      {verdict && verdict.cause !== "channel" && verdict.cause !== "send" && !advice && step.state !== "done" ? (
        <div className="flex flex-col gap-2" data-testid="setup-arrived">
          <p className="text-[16px] font-medium leading-[22px]">Пришло?</p>
          <Actions>
            <Button
              onClick={() => {
                actions.answerTest(true);
                moveOn();
              }}
              data-testid="setup-yes"
            >
              Да
            </Button>
            <Button variant="secondary" onClick={() => setAnswer("no")} data-testid="setup-no">
              Нет
            </Button>
          </Actions>
        </div>
      ) : null}

      {advice ? (
        <div className="flex flex-col gap-2.5 rounded-[12px] bg-surface-2 px-3 py-3" data-testid="setup-advice">
          <p className="text-[14px] font-semibold leading-[18px]">Что проверить · {advice.title}</p>
          <Steps items={advice.steps} />
          <p className="text-[13px] leading-[18px] text-muted">Уведомление может опоздать, если телефон без связи. Поправили — пришлите ещё раз.</p>
        </div>
      ) : null}

      <Actions>
        {verdict?.cause === "channel" ? (
          <Button loading={model.pushBusy} onClick={() => void actions.enablePush()} data-testid="setup-push-again">
            Подключить заново
          </Button>
        ) : null}
        {!verdict || verdict.done || advice ? (
          <Button
            variant={verdict || step.state === "done" ? "secondary" : "primary"}
            disabled={test.busy}
            onClick={send}
            data-testid="setup-test"
          >
            {verdict || step.state === "done" ? "Прислать ещё раз" : "Прислать пробное"}
          </Button>
        ) : null}
        <SkipButton step={step} model={model} moveOn={moveOn} />
      </Actions>
    </>
  );
}

function MicBody({ step, model, moveOn, pin }: { step: Step; model: SetupModel; moveOn: () => void; pin: () => void }) {
  const { facts, actions } = model;
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<MicOutcome | null>(null);

  if (checking) {
    return (
      <MicCheck
        onOutcome={(next) => {
          if (next === "heard") {
            actions.micDone();
            return;
          }
          setOutcome(next);
          setChecking(false);
        }}
        onDone={() => {
          actions.micDone();
          setChecking(false);
          moveOn();
        }}
      />
    );
  }

  const denied = outcome === "denied" || step.why === "denied";
  return (
    <>
      {step.state === "done" ? (
        <Lead>Микрофон работает — голосовые в переписке задачи запишутся.</Lead>
      ) : step.why === "unsupported" ? (
        <Lead>Здесь браузер не даёт микрофон. Голосовые можно записывать из Pulse на главном экране или в Chrome и Safari.</Lead>
      ) : (
        <Lead>Микрофон нужен для голосовых в переписке задачи. Проверю доступ и громкость — ничего не записывается и никуда не уходит.</Lead>
      )}
      {denied ? <Warn>{micAdvice(facts.platform, facts.standalone, facts.browser)}</Warn> : null}
      {outcome === "missing" ? <Warn>Микрофон не найден — проверьте, не занят ли он другим приложением.</Warn> : null}
      {outcome === "failed" ? <Warn>Не получилось включить микрофон — попробуйте ещё раз.</Warn> : null}
      <Actions>
        {step.why === "unsupported" ? null : (
          <Button
            variant={step.state === "done" || outcome ? "secondary" : "primary"}
            onClick={() => {
              // the step turns done the moment a voice comes through: it stays open for «Слышу вас»
              pin();
              setOutcome(null);
              setChecking(true);
            }}
            data-testid="setup-mic"
          >
            {step.state === "done" || outcome ? "Проверить ещё раз" : "Проверить"}
          </Button>
        )}
        <SkipButton step={step} model={model} moveOn={moveOn} />
      </Actions>
    </>
  );
}

/** A messenger's own browser: one request, and the link to carry over (D-190). */
function InAppCard({ name, ios }: { name: string; ios: boolean }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const browser = ios ? "Safari" : "Chrome";
  const copy = async () => {
    const url = `${window.location.origin}/setup`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // a web view without the clipboard API: the old way
      const field = document.createElement("textarea");
      field.value = url;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      let done = false;
      try {
        done = document.execCommand("copy");
      } catch {
        done = false;
      }
      field.remove();
      setCopied(done);
    }
  };

  return (
    <section className="card mt-4 flex flex-col gap-3 px-4 py-4" data-testid="setup-in-app">
      <h2 className="font-display text-[19px] font-semibold leading-6">Откройте в {browser}</h2>
      <Lead>
        Pulse открыт внутри {name || "другого приложения"}: отсюда его не поставить на главный экран, и уведомления сюда не приходят.
      </Lead>
      <Steps
        items={[
          <>В меню «⋯» или «Поделиться» — «Открыть в {ios ? "Safari" : "браузере"}».</>,
          <>Или скопируйте ссылку и вставьте её в адресную строку {browser}.</>,
        ]}
      />
      <Button block size="lg" onClick={() => void copy()} data-testid="setup-copy">
        {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
      </Button>
      {copied === false ? <p className="text-[13px] leading-[18px] text-muted">Не получилось скопировать: адрес — {typeof window === "undefined" ? "" : window.location.host}/setup</p> : null}
    </section>
  );
}

/** Everything through: where things arrive from now on, and home. */
function DoneCard({ team, onHome }: { team: boolean; onHome: () => void }) {
  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={springs.alive}
      className="card mt-4 flex flex-col items-center gap-3 px-4 py-5 text-center"
      data-testid="setup-done"
    >
      <Mascot state="happy" size={64} />
      <h2 className="font-display text-[19px] font-semibold leading-6">Готово</h2>
      {team ? (
        <div className="flex w-full flex-col gap-2 text-left">
          <p className="rounded-[12px] bg-surface-2 px-3 py-2.5 text-[15px] leading-[21px]">
            <span className="font-semibold">Пульс</span> — лично вам: поручения, слова директора, приглашения.
          </p>
          <p className="rounded-[12px] bg-surface-2 px-3 py-2.5 text-[15px] leading-[21px]">
            <span className="font-semibold" style={{ color: "var(--gold)" }}>
              Эфир
            </span>{" "}
            — для всех: объявления компании.
          </p>
        </div>
      ) : (
        <Lead>Ответы, сданные задачи и просьбы команды придут уведомлением.</Lead>
      )}
      <Button block size="lg" onClick={onHome} data-testid="setup-home">
        {"На Пульс"}
      </Button>
    </motion.section>
  );
}
