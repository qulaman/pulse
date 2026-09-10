"use client";

/** Last line of defence: the root layout itself failed, so no tokens, no components. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ru">
      <body style={{ margin: 0, background: "#0B0F14", color: "#E8EEF4", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>Приложение упало</h1>
          <p style={{ color: "#8C99A8", marginTop: 8 }}>Данные целы. Нажми, чтобы перезапустить</p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 24, minHeight: 44, padding: "0 20px", borderRadius: 12, border: 0, background: "#2ED3B7", color: "#0B0F14", fontWeight: 600, fontSize: 16 }}
          >
            Перезапустить
          </button>
        </main>
      </body>
    </html>
  );
}
