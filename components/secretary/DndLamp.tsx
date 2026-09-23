"use client";

/**
 * «Не беспокоить» as a state of the whole screen (D-97), not a card among the others: a lamp
 * at the top — the «ON AIR» of the director's door — with how long it has been on and who is
 * guarding it, and the room dimmed at the edges behind everything. The dim sits under the
 * content (negative z), so nothing on the screen loses contrast.
 */
export function DndLamp({ since, who, now }: { since: string; who: string | null; now: Date }) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 60_000));
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 85% at 50% 48%, transparent 52%, rgba(0, 0, 0, 0.42) 100%), linear-gradient(to bottom, color-mix(in srgb, var(--danger) 16%, transparent), transparent 26%)",
          animation: "smc-fade-in 0.6s ease-out both",
        }}
      />
      <div className="flex shrink-0 justify-center pt-2" data-testid="dnd-lamp">
        <p
          className="card-in inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold leading-4"
          style={{
            borderColor: "color-mix(in srgb, var(--danger) 55%, var(--border))",
            background: "color-mix(in srgb, var(--danger) 12%, var(--surface))",
          }}
        >
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--danger)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--danger) 25%, transparent)", animation: "smc-glow 2.4s ease-in-out infinite" }}
          />
          <span className="uppercase tracking-[0.06em]" style={{ color: "var(--danger)" }}>
            Не беспокоить
          </span>
          <span className="font-medium text-muted">
            · {minutes < 1 ? "только что" : `${minutes} мин`}
            {who ? ` · ${who}` : ""}
          </span>
        </p>
      </div>
    </>
  );
}
