"use client";

import { useEffect, useState } from "react";

import { toast } from "@/components/ui/Toast";
import { enablePush, pushPlatform, pushState, type PushState } from "@/lib/push/client";
import { pushEnabledToast } from "@/lib/push/words";

/**
 * This browser's push (D-114), the phone's row and the desk's alike: where it stands — read after
 * the first paint, the server knows nothing of it — and `enable`, which asks the browser and says
 * how it went.
 */
export function usePushSwitch() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
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
  return { state, busy, enable };
}
