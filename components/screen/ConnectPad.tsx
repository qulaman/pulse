"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/Button";
import { usePeople } from "@/lib/people/queries";
import { confirmError, formatPairCode, pairErrorOf, readPairCode, type PairError } from "@/lib/tv/pairing";

const FIELD =
  "min-h-[48px] field px-3 text-[16px] leading-[22px] outline-none transition-colors duration-[120ms] focus:border-accent";

/** Where the pad stands: typing, sending, done, or why it did not connect. */
export type PadPhase =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "done"; screen: string | null; device: string | null }
  /** `until` — the moment «Слишком много попыток» lets go (this phone's clock) */
  | { kind: "error"; error: PairError; until?: number };

type Confirmed = { ok: true; duplicate: boolean; screen: string | null; device: string | null };

class PairFailure extends Error {
  constructor(
    readonly error: PairError,
    readonly retryAfter?: number,
  ) {
    super(error);
    this.name = "PairFailure";
  }
}

/** The director's confirmation (D-182). No queue: without network the pad says so (D-76 §3). */
async function confirmPair(input: { code: string; requestId: string; screenId?: string }): Promise<Confirmed> {
  let res: Response;
  try {
    res = await fetch("/api/tv/pair/confirm", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: input.code, client_request_id: input.requestId, screen_id: input.screenId }),
    });
  } catch {
    throw new PairFailure("offline");
  }
  const body = (await res.json().catch(() => ({}))) as Partial<Confirmed> & { error?: { code?: string }; retry_after?: number };
  if (!res.ok || !body.ok) throw new PairFailure(pairErrorOf(body.error?.code), body.retry_after);
  return { ok: true, duplicate: Boolean(body.duplicate), screen: body.screen ?? null, device: body.device ?? null };
}

const noSubscribe = () => () => {};

/**
 * «Подключить экран» on the remote (D-182, I6): the TV shows six digits on `/tv-connect`, the
 * director types them here and the wall becomes his company's. A full code goes by itself; a slip
 * of the finger is caught on the phone (the sixth digit is a check). With several kiosks the pad
 * asks which one. No props — the remote puts it where it wants it.
 */
export function ConnectPad() {
  const people = usePeople();
  const screens = (people.data ?? [])
    .filter((p) => p.role === "tv" && p.is_active)
    .map((p) => ({ id: p.id, name: p.full_name }));
  const [value, setValue] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [phase, setPhase] = useState<PadPhase>({ kind: "idle" });
  const [now, setNow] = useState(() => Date.now());
  // one request id per code and screen: a retry after a lost answer is the same confirmation (principle 7)
  const request = useRef<{ key: string; id: string } | null>(null);
  const host = useSyncExternalStore(noSubscribe, () => window.location.host, () => null);
  const confirm = useMutation({ mutationFn: confirmPair, networkMode: "always", retry: false });

  const blockedUntil = phase.kind === "error" && phase.error === "too_many" ? (phase.until ?? 0) : 0;
  const blocked = blockedUntil > now;

  // «подождите N мин» counts down by itself and lets go when the time is over
  useEffect(() => {
    if (!blockedUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, [blockedUntil]);

  const several = screens.length > 1;
  const chosen = several ? (screens.find((s) => s.id === pick)?.id ?? null) : null;

  const submit = (raw: string) => {
    if (confirm.isPending || blocked) return;
    const read = readPairCode(raw);
    if (read.state === "short") return;
    if (read.state === "typo") return setPhase({ kind: "error", error: "typo" });
    if (several && !chosen) return setPhase({ kind: "error", error: "which_screen" });
    if (typeof navigator !== "undefined" && navigator.onLine === false) return setPhase({ kind: "error", error: "offline" });

    const key = `${read.digits}:${chosen ?? ""}`;
    if (request.current?.key !== key) request.current = { key, id: globalThis.crypto.randomUUID() };
    setPhase({ kind: "pending" });
    confirm.mutate(
      { code: read.digits, requestId: request.current.id, screenId: chosen ?? undefined },
      {
        onSuccess: (done) => setPhase({ kind: "done", screen: done.screen, device: done.device }),
        onError: (error) => {
          const failure = error instanceof PairFailure ? error : new PairFailure("failed");
          // the list of kiosks was older than the base: read it again for the choice
          if (failure.error === "which_screen" || failure.error === "no_screen") void people.refetch();
          const at = Date.now();
          setNow(at);
          setPhase({
            kind: "error",
            error: failure.error,
            until: failure.error === "too_many" ? at + (failure.retryAfter ?? 600) * 1000 : undefined,
          });
        },
      },
    );
  };

  return (
    <ConnectPadView
      value={value}
      onChange={(next) => {
        const digits = next.replace(/\D/g, "").slice(0, 6);
        setValue(formatPairCode(digits));
        if (phase.kind === "error" && !blocked) setPhase({ kind: "idle" });
        if (digits.length === 6) submit(digits);
      }}
      onSubmit={() => submit(value)}
      onAgain={() => {
        setValue("");
        setPhase({ kind: "idle" });
        request.current = null;
      }}
      phase={phase}
      blockedFor={blocked ? blockedUntil - now : 0}
      screens={screens}
      pick={chosen}
      onPick={(id) => {
        setPick(id);
        if (phase.kind === "error" && phase.error === "which_screen") setPhase({ kind: "idle" });
      }}
      host={host}
    />
  );
}

/** The pad's picture — the sandbox draws it in every state. */
export function ConnectPadView({
  value,
  onChange,
  onSubmit,
  onAgain,
  phase,
  blockedFor,
  screens,
  pick,
  onPick,
  host,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  onAgain: () => void;
  phase: PadPhase;
  /** milliseconds left of «Слишком много попыток» */
  blockedFor: number;
  screens: { id: string; name: string }[];
  pick: string | null;
  onPick: (id: string) => void;
  host: string | null;
}) {
  if (phase.kind === "done") {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center" data-testid="connect-done" role="status">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent">
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
            <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="font-display text-[19px] font-semibold leading-6">Экран подключён</p>
        {phase.screen || phase.device ? (
          <p className="text-[15px] leading-5">{[phase.screen, phase.device].filter(Boolean).join(" · ")}</p>
        ) : null}
        <p className="text-[14px] leading-[18px] text-muted">Через пару секунд на нём появится стена</p>
        <Button variant="ghost" onClick={onAgain} data-testid="connect-again">
          Подключить ещё экран
        </Button>
      </div>
    );
  }

  const pending = phase.kind === "pending";
  const blocked = blockedFor > 0;
  const error =
    phase.kind === "error"
      ? phase.error === "too_many"
        ? blocked
          ? confirmError("too_many", blockedFor / 1000)
          : null
        : confirmError(phase.error)
      : null;
  const ready = readPairCode(value).state === "ok";
  // «which screen» and «no screen» are directions, not failures
  const guide = phase.kind === "error" && (phase.error === "which_screen" || phase.error === "no_screen");

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="connect-pad"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <p className="text-[14px] leading-[18px] text-muted">
        На телевизоре откройте адрес{" "}
        <span className="select-all whitespace-nowrap font-semibold text-text">{host ? `${host}/tv-connect` : "/tv-connect"}</span>{" "}
        — экран покажет код из 6 цифр.
      </p>

      {screens.length > 1 ? (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Какой экран подключить">
          <span className="text-[14px] font-medium leading-[18px] text-muted">Какой экран?</span>
          <div className="flex flex-wrap gap-2">
            {screens.map((screen) => {
              const on = screen.id === pick;
              return (
                <button
                  key={screen.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onPick(screen.id)}
                  className={`min-h-[44px] rounded-[12px] border px-4 text-[15px] font-semibold leading-5 transition-[transform,scale,background-color,border-color,color] duration-[120ms] active:scale-[0.97] ${
                    on ? "border-accent bg-accent/15 text-text" : "border-border bg-surface-2 text-muted"
                  }`}
                  data-testid="connect-screen"
                >
                  {screen.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <label className="flex flex-col gap-2">
        <span className="text-[14px] font-medium leading-[18px] text-muted">Код с экрана</span>
        <input
          name="tv-code"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9 ]*"
          placeholder="000 000"
          value={value}
          disabled={pending || blocked}
          onChange={(event) => onChange(event.target.value)}
          className={`${FIELD} nums text-center font-mono text-[28px] font-semibold leading-[36px] tracking-[0.12em] placeholder:text-muted/40 disabled:opacity-60`}
          aria-describedby={error ? "connect-error" : undefined}
          aria-invalid={error ? true : undefined}
          data-testid="connect-code"
        />
      </label>

      {error ? (
        <p
          id="connect-error"
          role="alert"
          className={`text-[14px] leading-[18px] ${guide ? "text-text" : "text-danger"}`}
          data-testid="connect-error"
        >
          {error}
        </p>
      ) : null}

      {/* while it sends, the label says so at full strength; a second tap is ignored by the pad */}
      <Button type="submit" block disabled={blocked || (!ready && !pending)} aria-busy={pending || undefined} data-testid="connect-submit">
        {pending ? "Подключаю…" : "Подключить"}
      </Button>
    </form>
  );
}
