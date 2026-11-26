import { MiniMark, type MiniState } from "@/components/brand/MiniMark";
import { Button } from "@/components/ui/Button";

const STATES: { state: MiniState; tone?: string }[] = [
  { state: "still" },
  { state: "idle" },
  { state: "busy" },
  { state: "listening" },
  { state: "done", tone: "var(--ok)" },
  { state: "alert", tone: "var(--warn)" },
];
const SIZES = [12, 14, 16, 20, 24, 32, 48];

/** The small mark (D-209) in every state and size, in a line of text and in a button. */
export default function MiniSandbox() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-6" data-testid="mini-sandbox">
      <h1 className="text-[24px] font-bold leading-[30px]">Мини-маскот</h1>
      <div className="card flex flex-col gap-5 p-5">
        {STATES.map(({ state, tone }) => (
          <div key={state} className="flex items-center gap-4" data-row={state}>
            <span className="w-20 shrink-0 text-[13px] leading-4 text-muted">{state}</span>
            <div className="flex items-center gap-4 text-accent" style={tone ? { color: tone } : undefined}>
              {SIZES.map((size) => (
                <MiniMark key={size} state={state} size={size} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[16px] leading-[22px]">
        <MiniMark state="busy" tone="var(--accent)" /> Разбираю фразу… <MiniMark state="listening" tone="var(--accent)" /> Слушаю{" "}
        <MiniMark state="idle" tone="var(--accent)" /> на связи <MiniMark state="alert" tone="var(--warn)" /> ждёт
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button loading>Отправить</Button>
        <Button variant="secondary" loading>
          Сохранить
        </Button>
        <Button>Отправить</Button>
      </div>
    </main>
  );
}
