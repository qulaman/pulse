"use client";

import { BellOff, BellRing } from "lucide-react";
import { useEffect, useState } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { toast } from "@/components/ui/Toast";
import { playChime, unlockAudio, useDeskSound, writeDeskSound } from "@/lib/desk/chime";
import { enablePush, pushPlatform, pushState, type PushState } from "@/lib/push/client";
import { pushBlocker, pushEnabledToast } from "@/lib/push/words";

/** What is missing for this computer to ring, in a tooltip's words. */
function missing(push: PushState, sound: boolean): string {
  const parts = [
    push === "granted" ? "" : push === "denied" ? "уведомления запрещены в браузере" : push === "default" ? "уведомления выключены" : "браузер не присылает уведомлений",
    sound ? "" : "звук выключен",
  ].filter(Boolean);
  return `Не звонит: ${parts.join(", ")}. «Включить» — и новая просьба прозвенит здесь, даже когда вкладка закрыта или в фоне`;
}

/**
 * Whether this computer rings for a new request (D-175), in the page head of the secretary's
 * «Заявки»: «Звонит» while the browser's push is on and the sound is too — with «Без звука» at
 * hand; otherwise «Не звонит» and «Включить», which turns on whatever is missing: the sound at
 * once (the click itself lets the page sound — a chime answers it), the push through the browser's
 * own question. The same switches as «Профиль» → «Уведомления в этом браузере».
 */
export function RingState() {
  const { role } = useDeskScope();
  const sound = useDeskSound(role);
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  // the browser's answer may change in its own settings: read again when the window comes back
  useEffect(() => {
    const read = () => setPush(pushState());
    const timer = setTimeout(read, 0);
    window.addEventListener("focus", read);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", read);
    };
  }, []);

  if (!push) return <span className="ring-state" data-state="unknown" aria-hidden data-testid="desk-ring-state" />;
  const rings = push === "granted" && sound;

  const enable = async () => {
    if (!sound) writeDeskSound(true);
    unlockAudio(true);
    playChime();
    if (push === "granted") return;
    if (push !== "default") {
      toast(pushBlocker(push, pushPlatform()) ?? "Этот браузер не присылает уведомлений — звук будет, пока вкладка открыта");
      return;
    }
    setBusy(true);
    try {
      const next = await enablePush();
      setPush(next);
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

  if (rings) {
    return (
      <span className="ring-state" data-state="on" data-testid="desk-ring-state">
        <Tooltip label="Новая просьба прозвенит на этом компьютере, даже когда вкладка закрыта или в фоне">
          <span className="ring-state-word">
            <BellRing size={15} strokeWidth={2.25} aria-hidden />
            Звонит
          </span>
        </Tooltip>
        <button type="button" className="ring-state-move desk-focus" onClick={() => writeDeskSound(false)} data-testid="desk-ring-mute">
          Без звука
        </button>
      </span>
    );
  }
  return (
    <span className="ring-state" data-state="off" data-testid="desk-ring-state">
      <Tooltip label={missing(push, sound)}>
        <span className="ring-state-word">
          <BellOff size={15} strokeWidth={2.25} aria-hidden />
          Не звонит
        </span>
      </Tooltip>
      <button type="button" className="ring-state-move desk-focus" disabled={busy} onClick={() => void enable()} data-testid="desk-ring-enable">
        Включить
      </button>
    </span>
  );
}
