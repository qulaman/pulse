import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";

/** «Убрать правила компании?» — no run needed: the parse goes back to the core prompt. */
export function ClearRulesSheet({ open, pending, onClose, onConfirm }: { open: boolean; pending: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Убрать правила компании?">
      <p className="text-[15px] leading-[22px] text-muted">
        Разбор вернётся к ядру промпта — тому, что проверяет корпус в репозитории. Прогон для этого не нужен. Текст останется в истории версий.
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <Button block variant="danger" loading={pending} onClick={onConfirm} data-testid="parser-clear-confirm">
          Убрать
        </Button>
        <Button block variant="ghost" onClick={onClose}>
          Оставить
        </Button>
      </div>
    </Sheet>
  );
}
