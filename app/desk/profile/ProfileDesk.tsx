"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";

import { NotifyRules } from "@/app/desk/profile/NotifyRules";
import { PulseMark } from "@/components/brand/PulseMark";
import { usePushTest } from "@/components/push/usePushTest";
import { Dialog } from "@/components/desk/ui/Dialog";
import { Kbd } from "@/components/desk/ui/Kbd";
import { PageTitle } from "@/components/desk/ui/PageTitle";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { SettingGroup, SettingRow } from "@/components/desk/ui/SettingRow";
import { openShortcuts } from "@/components/desk/ui/Shortcuts";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { goPhoneView } from "@/lib/desk/device";
import { readNavFolded, subscribeFrame, writeNavFolded } from "@/lib/desk/frame";
import { useChangePassword } from "@/lib/desk/shell-queries";
import { dropMedia, listMedia } from "@/lib/media/pending";
import { ROLE_LABEL, useRevokeSessions } from "@/lib/people/queries";
import { enablePush, forgetThisDevice, pushPlatform, pushState, thisDeviceEndpoint, type PushState } from "@/lib/push/client";
import { pushBlocker, pushEnabledToast } from "@/lib/push/words";
import { homeForRole, type Role } from "@/lib/routes";
import { pluralRu } from "@/lib/tasks/status-text";
import { BUILD, versionLabel } from "@/lib/version";
import { dropPhrase, listPhrases } from "@/lib/voice/kept";

const PUSH_WORDS: Record<PushState, { text: string; tone: string }> = {
  granted: { text: "Включены", tone: "var(--ok)" },
  denied: { text: "Запрещены в браузере", tone: "var(--danger)" },
  default: { text: "Выключены", tone: "var(--text-muted)" },
  unsupported: { text: "Браузер не умеет", tone: "var(--text-muted)" },
  no_keys: { text: "Не настроены на сервере", tone: "var(--text-muted)" },
};

const TEST_TONE = { ok: "var(--ok)", warn: "var(--danger)", muted: "var(--text-muted)" } as const;

/** «Пароль»: a button that opens the form right in the row; Enter saves, Esc closes. */
function PasswordSetting() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const change = useChangePassword();
  const close = () => {
    setOpen(false);
    setPassword("");
    setRepeat("");
    setError(null);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 6) return setError("Не короче 6 символов");
    if (password !== repeat) return setError("Пароли не совпадают");
    setError(null);
    change.mutate(password, {
      onSuccess: () => {
        toast("Пароль обновлён");
        close();
      },
      onError: (failure) => setError(failure.message),
    });
  };
  return (
    <SettingRow
      label="Пароль"
      hint="Для входа по почте на этом и других компьютерах"
      testId="desk-profile-password"
      below={
        open ? (
          <form
            onSubmit={submit}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                close();
              }
            }}
            className="flex flex-wrap items-start gap-2"
          >
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Новый пароль"
              aria-label="Новый пароль"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              className="desk-input h-9 w-[220px] px-2.5 text-[14px] outline-none placeholder:text-muted"
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Ещё раз"
              aria-label="Повтор пароля"
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
              className="desk-input h-9 w-[220px] px-2.5 text-[14px] outline-none placeholder:text-muted"
            />
            <Button size="sm" type="submit" loading={change.isPending} disabled={!password || !repeat}>
              Сохранить
            </Button>
            <Button size="sm" variant="ghost" onClick={close}>
              Отмена
            </Button>
            {error ? (
              <p role="alert" className="w-full text-[13px] leading-5 text-danger">
                {error}
              </p>
            ) : null}
          </form>
        ) : null
      }
    >
      {open ? null : (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Сменить пароль
        </Button>
      )}
    </SettingRow>
  );
}

/** This browser's push (D-114): where it stands, one click to switch it on, «Проверить» — a real push and its fate. */
function PushSetting() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const test = usePushTest();
  useEffect(() => {
    const timer = setTimeout(() => setState(pushState()), 0);
    return () => clearTimeout(timer);
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const next = await enablePush();
      setState(next);
      if (next === "granted") {
        const done = pushEnabledToast(pushPlatform());
        toast(done.text, { lifetimeMs: done.lifetimeMs });
      } else if (next === "denied") toast("Уведомления запрещены в настройках браузера");
    } catch {
      toast("Не получилось включить уведомления");
    } finally {
      setBusy(false);
    }
  };

  const words = state ? PUSH_WORDS[state] : null;
  const blocker = state && state !== "granted" && state !== "default" ? pushBlocker(state, pushPlatform()) : null;
  return (
    <SettingRow
      label="Уведомления в этом браузере"
      hint={blocker ?? "Пуш приходит, даже когда вкладка закрыта, — пока браузер запущен"}
      testId="desk-profile-push"
    >
      {words ? (
        <span className="text-[13px]" style={{ color: words.tone }}>
          {words.text}
        </span>
      ) : null}
      {state === "default" ? (
        <Button size="sm" loading={busy} onClick={() => void enable()}>
          Включить
        </Button>
      ) : null}
      {state === "granted" ? (
        <>
          {test.verdict ? (
            <span className="max-w-[200px] truncate text-[12px]" style={{ color: TEST_TONE[test.verdict.tone] }} title={test.verdict.text}>
              {test.verdict.text}
            </span>
          ) : null}
          <Button size="sm" variant="secondary" disabled={test.busy} onClick={() => void test.run()}>
            Проверить
          </Button>
        </>
      ) : null}
    </SettingRow>
  );
}

/** «Выйти на других устройствах» (D-135): this computer stays signed in and keeps its pushes. */
function OthersSetting({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revoke = useRevokeSessions();
  const close = () => !revoke.isPending && setOpen(false);
  const submit = async () => {
    setError(null);
    const keepEndpoint = await thisDeviceEndpoint();
    revoke.mutate(
      { id: userId, keepCurrent: true, keepEndpoint },
      {
        onSuccess: ({ sessions }) => {
          toast(sessions > 0 ? `Вход закрыт на других устройствах · ${sessions}` : "Других входов не было");
          setOpen(false);
        },
        onError: (failure) => setError(failure.message),
      },
    );
  };
  return (
    <SettingRow label="Другие устройства" hint="Телефон забыт дома, планшет отдан — вход закроется везде, кроме этого компьютера" testId="desk-profile-others">
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Выйти на других устройствах
      </Button>
      <Dialog open={open} onClose={close} title="Выйти на других устройствах?" width="sm">
        <p className="text-[14px] leading-5 text-muted">Вход закроется на всех телефонах и компьютерах, кроме этого, и уведомления на них перестанут приходить.</p>
        {error ? (
          <p role="alert" className="mt-3 text-[13px] leading-5 text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="ghost" disabled={revoke.isPending} onClick={close}>
            Отмена
          </Button>
          <Button size="sm" variant="danger" loading={revoke.isPending} onClick={() => void submit()} data-testid="revoke-others">
            Выйти на других
          </Button>
        </div>
      </Dialog>
    </SettingRow>
  );
}

/** «2 записи и 1 файл из переписки» — what this browser still holds for the person (D-130). */
function waitingWords(phrases: number, files: number): string {
  return [
    ...(phrases > 0 ? [`${phrases} ${pluralRu(phrases, ["запись", "записи", "записей"])}`] : []),
    ...(files > 0 ? [`${files} ${pluralRu(files, ["файл", "файла", "файлов"])} из переписки`] : []),
  ].join(" и ");
}

/**
 * «Выйти» asks first; this browser stops getting the person's pushes before the session goes
 * (at most 1.5 s — no network keeps nobody signed in), and what it still holds unsent waits for
 * the person or is wiped («Стереть и выйти», D-130 §9) — the phone's SignOutRow, as a dialog.
 */
function SignOutSetting({ action, userId }: { action: () => Promise<void>; userId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [waiting, setWaiting] = useState({ phrases: 0, files: 0 });
  const forgotten = useRef(false);
  const erase = useRef(false);
  const form = useRef<HTMLFormElement>(null);

  const show = () => {
    setOpen(true);
    void Promise.all([listPhrases(userId), listMedia(userId)]).then(([phrases, files]) => setWaiting({ phrases: phrases.length, files: files.length }));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    setPending(true);
    if (forgotten.current) return;
    event.preventDefault();
    const target = event.currentTarget;
    const wipe = erase.current
      ? Promise.all([listPhrases(userId), listMedia(userId)]).then(([phrases, files]) => Promise.all([...phrases.map((p) => dropPhrase(p.id)), ...files.map((f) => dropMedia(f.id))]))
      : Promise.resolve();
    void wipe
      .then(() => Promise.race([forgetThisDevice(), new Promise((resolve) => setTimeout(resolve, 1500))]))
      .then(() => {
        forgotten.current = true;
        // a task later, never from this chain: a requestSubmit() fired inside the submit is dropped
        setTimeout(() => target.requestSubmit(), 0);
      });
  };
  const held = waitingWords(waiting.phrases, waiting.files);

  return (
    <SettingRow label="Выйти из аккаунта" hint="Задачи, сообщения и очки останутся на месте" testId="desk-profile-signout">
      <Button size="sm" variant="secondary" onClick={show}>
        Выйти
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} title="Выйти из аккаунта?" width="sm">
        <p className="text-[14px] leading-5 text-muted">Чтобы вернуться, понадобится пароль или код входа.</p>
        {held ? <p className="mt-3 text-[14px] leading-5">Ещё не отправлено: {held}. Отправлю сам, когда вы снова войдёте; другой человек на этом компьютере этого не увидит.</p> : null}
        <form ref={form} action={action} onSubmit={submit} className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
            Отмена
          </Button>
          {held ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                erase.current = true;
                form.current?.requestSubmit();
              }}
            >
              Стереть и выйти
            </Button>
          ) : null}
          <Button size="sm" type="submit" variant="danger" loading={pending}>
            {held ? "Выйти, отправить потом" : "Выйти"}
          </Button>
        </form>
      </Dialog>
    </SettingRow>
  );
}

/** How this computer shows the desk: the navigation folded or wide, the keys, the phone's screens. */
function ViewSettings({ role }: { role: Role }) {
  const folded = useSyncExternalStore(subscribeFrame, () => readNavFolded() ?? false, () => false);
  return (
    <SettingGroup className="desk-settings" testId="desk-profile-view">
      <SettingRow label="Боковая навигация" hint={<span className="inline-flex items-center gap-1">Свернуть и развернуть — клавиша <Kbd>[</Kbd></span>}>
        <SegmentTabs
          aria-label="Боковая навигация"
          value={folded ? "icons" : "wide"}
          onChange={(value) => writeNavFolded(value === "icons")}
          items={[
            { value: "wide", label: "С подписями" },
            { value: "icons", label: "Только значки" },
          ]}
        />
      </SettingRow>
      <SettingRow label="Клавиши" hint="Все сочетания этого экрана и рабочего стола">
        <Button size="sm" variant="secondary" onClick={openShortcuts}>
          Показать
          <Kbd>?</Kbd>
        </Button>
      </SettingRow>
      <SettingRow label="Телефонная версия" hint="Этот компьютер будет показывать экраны телефона, пока в профиле телефонной версии не нажать «Версия для компьютера»">
        <Button size="sm" variant="secondary" onClick={() => goPhoneView(homeForRole(role))} data-testid="desk-profile-phone">
          Открыть
        </Button>
      </SettingRow>
    </SettingGroup>
  );
}

/**
 * The desk's profile (D-153, D-154 wave 3, D-158): a computer's account page, not the phone's list
 * of 58 px rows — who is signed in beside the title, the account, this browser's notifications and
 * the director's rules as a table, the sessions, how this computer shows the desk, signing out;
 * every setting a label on the left and its control on the right, under one ruled sheet.
 */
export function ProfileDesk({
  userId,
  fullName,
  role,
  company,
  email,
  signOut,
}: {
  userId: string;
  fullName: string;
  role: Role;
  company: string;
  email: string | null;
  signOut: () => Promise<void>;
}) {
  const director = role === "director";
  return (
    <div className="flex flex-col gap-6" data-testid="desk-profile">
      <div data-testid="desk-profile-who">
        <PageTitle title="Профиль" state={{ text: `${ROLE_LABEL[role]} · ${company}` }} />
      </div>

      <section className="flex flex-col gap-1">
        <SectionLabel>Аккаунт</SectionLabel>
        <SettingGroup className="desk-settings">
          <SettingRow label="Имя" hint="Так вас видят в задачах и на стене">
            <span className="text-[14px]">{fullName}</span>
          </SettingRow>
          {email ? (
            <SettingRow label="Почта" hint="Вход на компьютере — по почте и паролю">
              <span className="text-[14px]">{email}</span>
            </SettingRow>
          ) : null}
          <PasswordSetting />
        </SettingGroup>
      </section>

      <section className="flex flex-col gap-1">
        <SectionLabel>Уведомления на этом компьютере</SectionLabel>
        <SettingGroup className="desk-settings">
          <PushSetting />
        </SettingGroup>
      </section>

      {director ? (
        <section className="flex flex-col gap-1">
          <NotifyRules meId={userId} />
        </section>
      ) : null}

      <section className="flex flex-col gap-1">
        <SectionLabel>Рабочий стол</SectionLabel>
        <ViewSettings role={role} />
      </section>

      <section className="flex flex-col gap-1">
        <SectionLabel>Сеансы</SectionLabel>
        <SettingGroup className="desk-settings">
          <OthersSetting userId={userId} />
          <SignOutSetting action={signOut} userId={userId} />
        </SettingGroup>
      </section>

      <footer className="flex items-center gap-3 opacity-50">
        <PulseMark />
        <span className="nums text-[12px] leading-4 text-muted">
          версия {versionLabel(BUILD)}
          {BUILD.at && BUILD.sha ? ` · ${BUILD.sha}` : ""}
        </span>
      </footer>
    </div>
  );
}
