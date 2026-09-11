"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";

const DISMISS_KEY = "pulse.install.dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "android" | "ios" | "other";

function detect(): { standalone: boolean; platform: Platform } {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  const ua = nav.userAgent;
  const platform: Platform = /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : "other";
  return { standalone, platform };
}

/**
 * Onboarding step 2 of docs/FRONTEND.md: the app lives on the home screen — a standalone
 * window and, on iOS ≥ 16.4, the only way to get push. Hidden once installed or dismissed.
 * Android: the browser's own prompt behind a real button; iOS: the two taps in words.
 * `bubble` renders it as one of the assistant's lines on Пульс, otherwise as a card.
 */
export function InstallHint({ bubble = false }: { bubble?: boolean }) {
  const [state, setState] = useState<{ standalone: boolean; platform: Platform } | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setState(detect());
      let hidden = false;
      try {
        hidden = window.localStorage.getItem(DISMISS_KEY) === "1";
      } catch {
        hidden = false;
      }
      setDismissed(hidden);
    }, 0);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  if (!state || state.standalone || dismissed) return null;
  // a desktop browser is not where the director lives; the landing already says «на телефоне»
  if (state.platform === "other" && !installEvent) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // private mode: the hint simply comes back next time
    }
    setDismissed(true);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setDismissed(true);
    setInstallEvent(null);
  };

  const text =
    state.platform === "ios"
      ? "Добавь Pulse на главный экран: внизу Safari нажми «Поделиться», затем «На экран «Домой»». Так придут уведомления и откроется без адресной строки."
      : "Добавь Pulse на главный экран: откроется как приложение, без адресной строки, и уведомления придут даже когда браузер закрыт.";

  const actions = (
    <div className="mt-3 flex gap-2">
      {installEvent ? (
        <Button variant="primary" className="!min-h-[40px] !px-4 !text-[14px]" onClick={() => void install()}>
          Установить
        </Button>
      ) : null}
      <Button variant="ghost" className="!min-h-[40px] !px-3 !text-[14px]" onClick={dismiss}>
        {installEvent ? "Не сейчас" : "Понятно"}
      </Button>
    </div>
  );

  if (bubble) {
    return (
      <div className="card-in relative py-1 pl-4">
        <span aria-hidden className="absolute left-0 top-[11px] h-2 w-2 rounded-full" style={{ background: "var(--text-muted)" }} />
        <p className="text-[17px] leading-6">{text}</p>
        {actions}
      </div>
    );
  }

  return (
    <div className="card-in card mt-4 flex items-start gap-3 px-4 py-3">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0">
        <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
        <path d="M12 8v6M9 11h6" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] leading-[22px]">На главный экран</p>
        <p className="mt-1 text-[13px] leading-4 text-muted">{text}</p>
        {actions}
      </div>
    </div>
  );
}
