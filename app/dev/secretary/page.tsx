import { SecretaryMascot } from "@/components/secretary/SecretaryMascot";
import type { DeskPhase, DeskScene } from "@/lib/errands/scene";

const CELLS: { scene: DeskScene | null; phase: DeskPhase; caption: string; bare?: boolean; talking?: boolean }[] = [
  { scene: null, phase: "rest", caption: "Покой — печатает" },
  { scene: "coffee", phase: "asked", caption: "Просят кофе" },
  { scene: "coffee", phase: "doing", caption: "Варит кофе" },
  { scene: "tea", phase: "doing", caption: "Заваривает чай" },
  { scene: "dnd", phase: "asked", caption: "Просят «не беспокоить»" },
  { scene: "dnd", phase: "doing", caption: "Не беспокоить" },
  { scene: "guest", phase: "asked", caption: "Просят пригласить гостя" },
  { scene: "guest", phase: "doing", caption: "Приглашает гостя" },
  { scene: "tea", phase: "asked", caption: "Просят чай" },
  { scene: "doctor", phase: "doing", caption: "Вызывает врача" },
  { scene: "come", phase: "doing", caption: "Идёт к директору" },
  { scene: "other", phase: "doing", caption: "Своя кнопка" },
  { scene: "coffee", phase: "done", caption: "Готово" },
  { scene: null, phase: "rest", caption: "Шарики открыты — говорит", bare: true, talking: true },
];

/** /dev/secretary — every scene of the secretary's face on one screen (dev only, D-87). */
export default function SecretarySandboxPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <h1 className="text-[24px] font-bold leading-[30px]">Маскот секретаря</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">Сцены по заявке директора: покой, просьба, работа, готово (D-87)</p>
      <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3" data-testid="secretary-sandbox">
        {CELLS.map((cell) => (
          <figure
            key={`${cell.scene}-${cell.phase}-${cell.caption}`}
            className="flex flex-col items-center gap-2 overflow-hidden rounded-[20px] border border-border bg-surface/40 px-2 pb-3 pt-14"
            data-cell={`${cell.scene ?? "none"}-${cell.phase}`}
          >
            <div className="flex h-[132px] w-full items-center justify-center pl-10">
              <SecretaryMascot scene={cell.scene} phase={cell.phase} bare={cell.bare} talking={cell.talking} size={112} />
            </div>
            <figcaption className="text-center text-[13px] leading-4 text-muted">{cell.caption}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
