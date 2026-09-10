import { colors, durations, overlay, radii, typography } from "@/lib/design/tokens";

export default function TokensPage() {
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6">
      <h1 className="text-[24px] font-bold leading-[30px]">Токены</h1>

      <h2 className="mt-6 text-[19px] font-semibold leading-6">Цвет</h2>
      <ul className="mt-3 grid grid-cols-2 gap-3">
        {Object.entries(colors).map(([name, hex]) => (
          <li key={name} className="rounded-2xl border border-border bg-surface p-3">
            <div
              className="h-12 w-full rounded-xl border border-border"
              style={{ background: hex }}
            />
            <p className="mt-2 text-[14px] font-medium leading-[18px]">--{name}</p>
            <p className="nums text-[13px] leading-4 text-muted">{hex}</p>
          </li>
        ))}
        <li className="rounded-2xl border border-border bg-surface p-3">
          <div
            className="h-12 w-full rounded-xl border border-border"
            style={{ background: overlay }}
          />
          <p className="mt-2 text-[14px] font-medium leading-[18px]">--overlay</p>
          <p className="nums text-[13px] leading-4 text-muted">{overlay}</p>
        </li>
      </ul>

      <h2 className="mt-8 text-[19px] font-semibold leading-6">Типографика</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {Object.entries(typography).map(([name, style]) => (
          <li key={name} className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-[13px] leading-4 text-muted">
              {name} — {style.size}/{style.lineHeight}, {style.weight}
            </p>
            <p
              style={{
                fontSize: style.size,
                lineHeight: `${style.lineHeight}px`,
                fontWeight: style.weight,
              }}
            >
              Отправил Марату и Ерлану
            </p>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-[19px] font-semibold leading-6">Форма и движение</h2>
      <ul className="mt-3 flex flex-wrap gap-3">
        {Object.entries(radii).map(([name, value]) => (
          <li
            key={name}
            className="border border-border bg-surface-2 px-3 py-2 text-[13px] leading-4"
            style={{ borderRadius: value }}
          >
            {name} {value}
          </li>
        ))}
        {Object.entries(durations).map(([name, value]) => (
          <li
            key={name}
            className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] leading-4"
          >
            --t-{name} {value}
          </li>
        ))}
      </ul>
    </main>
  );
}
