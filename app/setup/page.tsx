"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoginCodePanel } from "@/components/people/LoginCodePanel";
import { SetupSkeleton } from "@/components/setup/SetupSkeleton";
import { SetupView } from "@/components/setup/SetupView";
import { useSetup } from "@/components/setup/useSetup";
import { Sheet } from "@/components/ui/Sheet";
import { homeForRole } from "@/lib/routes";
import { writeMarks } from "@/lib/setup/marks";

/** Where the person came from: Лента's line and the first sign-in say `feed`, Пульс's `pulse`, the profile row `profile`. */
function cameFrom(): string | null {
  return new URLSearchParams(window.location.search).get("from");
}

/**
 * «Подключение» (D-190) — the live screen: this phone's facts, the person's own subscription on the
 * server, the marks kept on the phone. Opened once it counts as seen: the first sign-in does not
 * open it again by itself. «Позже» goes back where the person came from; on an iPhone tab the
 * home-screen app's sign-in code is one tap away (D-135).
 */
export default function SetupPage() {
  const model = useSetup();
  const router = useRouter();
  // a fresh panel (and code) per opening; the closing sheet keeps the last one on screen
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeKey, setCodeKey] = useState(0);
  const userId = model?.userId;
  const seen = Boolean(model?.marks.seen);

  useEffect(() => {
    if (userId && !seen) writeMarks(userId, { seen: new Date().toISOString() });
  }, [userId, seen]);

  if (!model) return <SetupSkeleton />;

  const home = homeForRole(model.role);
  const leave = () => {
    if (cameFrom() && window.history.length > 1) router.back();
    else router.replace(home);
  };
  const goHome = () => {
    // from a home screen — back to it; from the profile — on to the home screen
    const from = cameFrom();
    if ((from === "feed" || from === "pulse") && window.history.length > 1) router.back();
    else router.replace(home);
  };
  const iosTab = model.facts.platform === "ios" && !model.facts.standalone;

  return (
    <>
      <SetupView
        model={model}
        onLeave={leave}
        onHome={goHome}
        onCode={
          iosTab
            ? () => {
                setCodeKey((k) => k + 1);
                setCodeOpen(true);
              }
            : undefined
        }
      />
      {/* signing in in the home-screen app does not sign this tab out */}
      <Sheet open={codeOpen} onClose={() => setCodeOpen(false)} title="Код для приложения">
        <LoginCodePanel key={codeKey} person={{ id: model.userId, full_name: model.fullName }} self autoIssue onDone={() => setCodeOpen(false)} />
      </Sheet>
    </>
  );
}
