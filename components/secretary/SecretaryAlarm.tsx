"use client";

import { useEffect, useState } from "react";

import { SecretaryMascot } from "@/components/secretary/SecretaryMascot";
import { useErrandActions } from "@/lib/errands/mutations";
import { useErrands, useSecretaryActions, useSecretarySetup } from "@/lib/errands/queries";
import { sceneOf } from "@/lib/errands/scene";
import { useNow } from "@/lib/pulse/queries";
import { useMe } from "@/lib/tasks/queries";
import { firstNameOf } from "@/lib/text/normalize";

const VIBRATED_KEY = "pulse.alarm.vibrated";

function seconds(since: string, now: Date): string {
  const s = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 1000));
  return s < 60 ? `${s} с назад` : `${Math.floor(s / 60)} мин назад`;
}

/**
 * «Вызови охрану!» (D-99) on every screen of a secretary, over everything: the room goes red
 * and pulses, the secretary under a police light, the director's words, one big answer. Taken
 * by another secretary — a thin banner instead, the screen is free again. The one who took it
 * closes it with «Охрана на месте»; «Свернуть» leaves a banner while the phone is needed for
 * the call. The phone buzzes once per alarm (where the browser lets a page buzz).
 */
export function SecretaryAlarm({ meId }: { meId: string }) {
  const errands = useErrands(true);
  const catalogue = useSecretaryActions(true);
  const setup = useSecretarySetup(true);
  const now = useNow(5_000);
  const transition = useErrandActions();
  const [folded, setFolded] = useState<string | null>(null);

  const alarm =
    (errands.data ?? []).find(
      (e) => (e.status === "sent" || e.status === "accepted") && sceneOf(e, catalogue.data ?? []) === "security",
    ) ?? null;
  const mine = alarm?.status === "accepted" && alarm.claimed_by === meId;
  const theirs = alarm?.status === "accepted" && alarm.claimed_by !== meId;

  // buzz once per alarm, not on every render or every screen change
  const alarmId = alarm?.status === "sent" ? alarm.id : null;
  useEffect(() => {
    if (!alarmId) return;
    try {
      if (window.sessionStorage.getItem(VIBRATED_KEY) === alarmId) return;
      window.sessionStorage.setItem(VIBRATED_KEY, alarmId);
    } catch {
      // without the mark it may buzz twice — better than not at all
    }
    navigator.vibrate?.([400, 150, 400, 150, 800]);
  }, [alarmId]);

  if (!alarm) return null;
  const phone = setup.data?.securityPhone ?? "";
  const who = firstNameOf(alarm.claimed?.full_name ?? "");

  if (theirs || folded === alarm.id) {
    return (
      <div
        className="fixed inset-x-0 top-0 z-[90] flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+6px)]"
        data-testid="alarm-banner"
      >
        <button
          type="button"
          onClick={() => setFolded(null)}
          className="flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold leading-5 text-white"
          style={{ background: "var(--danger)", boxShadow: "var(--shadow-raised)", animation: theirs ? "none" : "smc-glow 1.2s ease-in-out infinite" }}
        >
          🚨 {theirs ? `Охрану вызывает ${who || "секретарь"}` : "Охрана · развернуть"}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 text-center" role="alertdialog" aria-label="Вызови охрану" data-testid="alarm-overlay">
      {/* the room goes red and pulses; the dark core keeps the words readable */}
      <div aria-hidden className="absolute inset-0" style={{ background: "var(--bg)" }} />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: "radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--danger) 30%, transparent), color-mix(in srgb, var(--danger) 70%, transparent))",
          animation: "smc-sos 1s ease-in-out infinite",
        }}
      />
      <div className="relative flex flex-col items-center">
        <div className="mb-2 mt-6">
          <SecretaryMascot scene="security" phase={mine ? "doing" : "asked"} size={150} />
        </div>
        <p className="font-display text-[34px] font-black leading-[38px] tracking-[-0.02em] text-white" data-testid="alarm-title">
          {mine ? "Охрана вызывается" : "ВЫЗОВИ ОХРАНУ!"}
        </p>
        <p className="mt-2 text-[15px] leading-5 text-white/85">
          {firstNameOf(alarm.author?.full_name ?? "Директор")} · {seconds(alarm.created_at, now)}
        </p>
        {alarm.note ? <p className="mt-1 text-[17px] font-semibold leading-6 text-white">{alarm.note}</p> : null}

        <div className="mt-7 flex w-full max-w-[320px] flex-col gap-2.5">
          {phone ? (
            <a
              href={`tel:${phone.replace(/[^+\d]/g, "")}`}
              className="flex min-h-[56px] items-center justify-center rounded-[18px] bg-white text-[18px] font-bold text-[#b3261e]"
              data-testid="alarm-call"
            >
              📞 Позвонить охране
            </a>
          ) : null}
          {/* the answer: dark on the red, the call above it white — the two biggest things here */}
          <button
            type="button"
            disabled={transition.isPending}
            onClick={() =>
              // «Охрана на месте» — the director hears it from the push of this very step
              transition.mutate({ id: alarm.id, to: mine ? "done" : "accepted" })
            }
            className="flex min-h-[56px] items-center justify-center rounded-[18px] border border-white/35 text-[18px] font-bold text-white transition-transform duration-[120ms] active:scale-[0.97] disabled:opacity-60"
            style={{ background: "color-mix(in srgb, var(--bg) 82%, transparent)" }}
            data-testid={mine ? "alarm-done" : "alarm-accept"}
          >
            {mine ? "Охрана на месте" : "Вызываю охрану"}
          </button>
          <button type="button" className="min-h-[44px] text-[14px] font-semibold text-white/80" onClick={() => setFolded(alarm.id)}>
            Свернуть
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Mounted once in the root layout: whatever screen a secretary is on — Лента, a task, the
 * calendar, the profile — the alarm reaches it. Anybody else, and a signed-out page, get
 * nothing.
 */
export function SecretaryAlarmGate() {
  const me = useMe();
  if (me.data?.role !== "secretary") return null;
  return <SecretaryAlarm meId={me.data.userId} />;
}
