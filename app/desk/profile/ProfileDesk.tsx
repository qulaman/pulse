"use client";

import { ArrowRight, Bell, LogOut, MonitorSmartphone, PanelLeft, Smartphone } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";

import { NotifyRules } from "@/app/desk/profile/NotifyRules";
import { PulseMark } from "@/components/brand/PulseMark";
import { CopyButton } from "@/components/desk/team/fields";
import { TileFace } from "@/components/desk/team/TeamGrid";
import { usePushTest } from "@/components/push/usePushTest";
import { Dialog } from "@/components/desk/ui/Dialog";
import { Kbd } from "@/components/desk/ui/Kbd";
import { PageTitle } from "@/components/desk/ui/PageTitle";
import { openShortcuts } from "@/components/desk/ui/Shortcuts";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { goPhoneView } from "@/lib/desk/device";
import { readNavFolded, subscribeFrame, writeNavFolded } from "@/lib/desk/frame";
import { useChangePassword } from "@/lib/desk/shell-queries";
import { dropMedia, listMedia } from "@/lib/media/pending";
import { ROLE_LABEL, usePeople, useRevokeSessions } from "@/lib/people/queries";
import { enablePush, forgetThisDevice, pushPlatform, pushState, thisDeviceEndpoint, type PushState } from "@/lib/push/client";
import { pushBlocker, pushEnabledToast } from "@/lib/push/words";
import { homeForRole, type Role } from "@/lib/routes";
import { pluralRu } from "@/lib/tasks/status-text";
import { BUILD, versionLabel } from "@/lib/version";
import { dropPhrase, listPhrases } from "@/lib/voice/kept";

import { ProfileCard, ProfileNav, ProfileRow, StateBadge, type ProfileSection } from "./parts";

const PUSH_WORDS: Record<PushState, { text: string; tone: "ok" | "danger" | "muted" }> = {
  granted: { text: "Включены", tone: "ok" },
  denied: { text: "Запрещены в браузере", tone: "danger" },
  default: { text: "Выключены", tone: "muted" },
  unsupported: { text: "Браузер не умеет", tone: "muted" },
  no_keys: { text: "Не настроены на сервере", tone: "muted" },
};

const TEST_TONE = { ok: "var(--ok)", warn: "var(--danger)", muted: "var(--text-muted)" } as const;

/** «Пароль»: the card opens its form in place; Enter saves, Esc closes; what is wrong is said under the fields. */
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
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
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
  // said while typing, once there is something to say: short, or the two differ
  const live = password && password.length < 6 ? "Ещё не короче 6 символов" : repeat && repeat !== password ? "Пока не совпадают" : null;
  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <ProfileCard
        id="profile-password"
        testId="desk-profile-password"
        title="Пароль"
        description="Для входа по почте на этом и других компьютерах. Телефон входит по коду и пароля не спрашивает."
        note={
          open ? (
            error ? (
              <span role="alert" className="text-danger">
                {error}
              </span>
            ) : live ? (
              <span>{live}</span>
            ) : password && repeat ? (
              <span className="text-ok">Можно сохранять</span>
            ) : (
              <span>
                Не короче 6 символов · <Kbd>Enter</Kbd> сохранить · <Kbd>Esc</Kbd> отменить
              </span>
            )
          ) : (
            "Старый пароль перестанет работать сразу"
          )
        }
        actions={
          open ? (
            <>
              <Button size="sm" variant="ghost" onClick={close}>
                Отмена
              </Button>
              <Button size="sm" type="submit" loading={change.isPending} disabled={!password || !repeat}>
                Сохранить
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
              Сменить пароль
            </Button>
          )
        }
      >
        {open ? (
          <div className="profile-fields">
            <label className="profile-field">
              <span>Новый пароль</span>
              <input
                type="password"
                autoComplete="new-password"
                aria-label="Новый пароль"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoFocus
                className="field h-9 w-full px-3 text-[14px] outline-none"
                aria-invalid={Boolean(error) || undefined}
              />
            </label>
            <label className="profile-field">
              <span>Ещё раз</span>
              <input
                type="password"
                autoComplete="new-password"
                aria-label="Повтор пароля"
                value={repeat}
                onChange={(event) => setRepeat(event.target.value)}
                className="field h-9 w-full px-3 text-[14px] outline-none"
                aria-invalid={Boolean(error) || undefined}
              />
            </label>
          </div>
        ) : null}
      </ProfileCard>
    </form>
  );
}

/** This browser's push (D-114): where it stands, one click to switch it on, «Проверить» — a real push and its fate. */
function PushSetting({ director }: { director: boolean }) {
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
    <ProfileCard
      id="profile-push"
      testId="desk-profile-push"
      title="Уведомления в этом браузере"
      description={blocker ?? "Пуш приходит, даже когда вкладка закрыта, — пока браузер запущен."}
      note={
        test.verdict ? (
          <span style={{ color: TEST_TONE[test.verdict.tone] }} title={test.verdict.text}>
            {test.verdict.text}
          </span>
        ) : state === "granted" ? (
          "«Проверить» пришлёт настоящий пуш и скажет, дошёл ли он"
        ) : null
      }
      actions={
        state === "default" ? (
          <Button size="sm" loading={busy} onClick={() => void enable()}>
            Включить
          </Button>
        ) : state === "granted" ? (
          <Button size="sm" variant="secondary" disabled={test.busy} onClick={() => void test.run()}>
            {test.busy ? "Проверяю…" : "Проверить"}
          </Button>
        ) : null
      }
    >
      <div className="profile-device">
        <span className="profile-device-icon" aria-hidden>
          <Bell size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium leading-5">Этот компьютер</p>
          <p className="text-[12px] leading-4 text-muted">{director ? "Задачи, ответы и заявки — по правилам ниже" : "Заявки и напоминания — сразу, задачи — в рабочие часы компании"}</p>
        </div>
        {words ? <StateBadge tone={words.tone}>{words.text}</StateBadge> : <span className="skeleton block h-[26px] w-[96px] rounded-full bg-surface-2" />}
      </div>
    </ProfileCard>
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
    <ProfileRow label="Другие устройства" hint="Телефон забыт дома, планшет отдан — вход закроется везде, кроме этого компьютера" testId="desk-profile-others">
      <Button size="sm" variant="secondary" icon={<MonitorSmartphone size={15} strokeWidth={2} aria-hidden />} onClick={() => setOpen(true)}>
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
    </ProfileRow>
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
    <ProfileRow label="Выйти из аккаунта" hint="Задачи, сообщения и очки останутся на месте" testId="desk-profile-signout">
      <Button size="sm" variant="secondary" icon={<LogOut size={15} strokeWidth={2} aria-hidden />} onClick={show}>
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
    </ProfileRow>
  );
}

/** How this computer shows the desk: the navigation folded or wide, the keys, the phone's screens. */
function ViewSettings({ role }: { role: Role }) {
  const folded = useSyncExternalStore(subscribeFrame, () => readNavFolded() ?? false, () => false);
  return (
    <ProfileCard id="profile-view" testId="desk-profile-view" title="Рабочий стол" description="Как этот компьютер показывает Pulse. Запоминается в этом браузере.">
      <div className="profile-rows">
        <ProfileRow
          label={
            <span className="inline-flex items-center gap-2">
              <PanelLeft size={15} strokeWidth={2} className="text-muted" aria-hidden />
              Боковая навигация
            </span>
          }
          hint={<span className="inline-flex items-center gap-1">Свернуть и развернуть — клавиша <Kbd>[</Kbd></span>}
        >
          <SegmentTabs
            aria-label="Боковая навигация"
            value={folded ? "icons" : "wide"}
            onChange={(value) => writeNavFolded(value === "icons")}
            items={[
              { value: "wide", label: "С подписями" },
              { value: "icons", label: "Только значки" },
            ]}
          />
        </ProfileRow>
        <ProfileRow
          label={
            <span className="inline-flex items-center gap-2">
              <Kbd>?</Kbd>
              Клавиши
            </span>
          }
          hint="Все сочетания этого экрана и рабочего стола"
        >
          <Button size="sm" variant="secondary" onClick={openShortcuts}>
            Показать
          </Button>
        </ProfileRow>
        <ProfileRow
          label={
            <span className="inline-flex items-center gap-2">
              <Smartphone size={15} strokeWidth={2} className="text-muted" aria-hidden />
              Телефонная версия
            </span>
          }
          hint="Этот компьютер будет показывать экраны телефона, пока в профиле телефонной версии не нажать «Версия для компьютера»"
        >
          <Button size="sm" variant="secondary" onClick={() => goPhoneView(homeForRole(role))} data-testid="desk-profile-phone">
            Открыть
          </Button>
        </ProfileRow>
      </div>
    </ProfileCard>
  );
}

/**
 * The desk's profile (D-153, D-154 wave 3, D-158, D-174): a computer's account page, laid out as
 * settings read on Vercel — who is signed in on top; on the left the page's own contents that
 * follow the scroll; on the right a card a subject, each with its title, what it is for, the
 * control, and a foot with a note and the card's action: the account, the password, this
 * browser's notifications and the director's rules, how this computer shows the desk, the sessions.
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
  const people = usePeople();
  const avatar = people.data?.find((person) => person.id === userId)?.avatar_url ?? null;
  const sections: ProfileSection[] = [
    { id: "profile-account", label: "Аккаунт" },
    { id: "profile-password", label: "Пароль" },
    { id: "profile-push", label: "Уведомления" },
    ...(director ? [{ id: "profile-rules", label: "Что присылать" }, { id: "profile-when", label: "Когда и как" }] : []),
    { id: "profile-view", label: "Рабочий стол" },
    { id: "profile-sessions", label: "Сеансы" },
  ];
  return (
    <div className="profile flex flex-col gap-6" data-testid="desk-profile">
      <div className="profile-who" data-testid="desk-profile-who">
        <PageTitle title="Профиль" state={{ text: `${ROLE_LABEL[role]} · ${company}` }} />
      </div>

      <div className="profile-layout">
        <aside className="profile-aside">
          <ProfileNav sections={sections} />
        </aside>

        <div className="profile-main">
          <ProfileCard
            id="profile-account"
            title="Аккаунт"
            description="Так вас видят в задачах, в «Команде» и на стене."
            note={director ? "Имя, должность и фото меняются в вашей карточке" : "Имя и фото меняет директор в «Команде»"}
            actions={
              director ? (
                <Link href={`/desk/team/${userId}`} className="profile-link">
                  Открыть карточку
                  <ArrowRight size={14} strokeWidth={2.25} aria-hidden />
                </Link>
              ) : null
            }
          >
            <div className="profile-identity">
              <TileFace person={{ id: userId, full_name: fullName, avatar_url: avatar }} size={64} />
              <div className="min-w-0 flex-1">
                <p className="profile-identity-name">{fullName}</p>
                <p className="profile-identity-line">
                  {ROLE_LABEL[role]} · {company}
                </p>
              </div>
            </div>
            {email ? (
              <div className="profile-rows">
                <ProfileRow label="Почта" hint="Вход на компьютере — по почте и паролю">
                  <span className="text-[14px]">{email}</span>
                  <CopyButton text={() => email} label="Скопировать почту" done="Скопировал почту" />
                </ProfileRow>
              </div>
            ) : null}
          </ProfileCard>

          <PasswordSetting />
          <PushSetting director={director} />
          {director ? <NotifyRules meId={userId} /> : null}
          <ViewSettings role={role} />

          <ProfileCard id="profile-sessions" title="Сеансы" description="Где открыт ваш вход. Выход здесь не трогает задачи и историю.">
            <div className="profile-rows">
              <OthersSetting userId={userId} />
              <SignOutSetting action={signOut} userId={userId} />
            </div>
          </ProfileCard>

          <footer className="profile-version">
            <PulseMark />
            <span className="nums text-[12px] leading-4 text-muted">
              версия {versionLabel(BUILD)}
              {BUILD.at && BUILD.sha ? ` · ${BUILD.sha}` : ""}
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}
