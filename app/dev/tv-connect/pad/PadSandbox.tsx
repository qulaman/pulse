"use client";

import { ConnectPadView, type PadPhase } from "@/components/screen/ConnectPad";

const ONE = [{ id: "s1", name: "Экран в кабинете" }];
const TWO = [
  { id: "s1", name: "Экран в кабинете" },
  { id: "s2", name: "Экран в холле" },
];

type Case = { value: string; phase: PadPhase; blockedFor?: number; screens?: typeof ONE; pick?: string | null };

const CASES: Record<string, Case> = {
  idle: { value: "", phase: { kind: "idle" } },
  typing: { value: "482 9", phase: { kind: "idle" } },
  ready: { value: "482 918", phase: { kind: "idle" } },
  several: { value: "482 918", phase: { kind: "idle" }, screens: TWO, pick: "s2" },
  which: { value: "482 918", phase: { kind: "error", error: "which_screen" }, screens: TWO, pick: null },
  pending: { value: "482 918", phase: { kind: "pending" } },
  done: { value: "482 918", phase: { kind: "done", screen: "Экран в кабинете", device: "телевизор" } },
  bad: { value: "482 918", phase: { kind: "error", error: "bad_code" } },
  typo: { value: "482 981", phase: { kind: "error", error: "typo" } },
  "too-many": { value: "482 918", phase: { kind: "error", error: "too_many" }, blockedFor: 7 * 60_000 },
  offline: { value: "482 918", phase: { kind: "error", error: "offline" } },
  "no-screen": { value: "482 918", phase: { kind: "error", error: "no_screen" }, screens: [] },
};

const nothing = () => {};

/** The pad in one state, in a phone column. */
export function PadSandbox({ which }: { which: string }) {
  const c = CASES[which] ?? CASES.idle;
  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg bg-bg px-4 py-6">
      <h1 className="mb-4 font-display text-[19px] font-semibold leading-6">Подключить экран</h1>
      <ConnectPadView
        value={c.value}
        onChange={nothing}
        onSubmit={nothing}
        onAgain={nothing}
        phase={c.phase}
        blockedFor={c.blockedFor ?? 0}
        screens={c.screens ?? ONE}
        pick={c.pick ?? null}
        onPick={nothing}
        host="pulse.example.kz"
      />
    </main>
  );
}

