"use client";

import { Dialog } from "@/components/desk/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { useDeletePerson } from "@/lib/people/card-queries";
import type { Person } from "@/lib/people/queries";

import { Face, roleLine } from "./shared";

/**
 * «Удалить карточку…»: only a card without history gets here — a duplicate or a typo (the owner,
 * 2026-11-04). The server asks again, by itself; a refusal is said and the card stays.
 */
export function DeleteDialog({ person, onClose, onDeleted }: { person: Person; onClose: () => void; onDeleted: () => void }) {
  const remove = useDeletePerson();
  const confirm = () =>
    remove.mutate(person.id, {
      onSuccess: () => {
        toast("Карточка удалена");
        onDeleted();
      },
      onError: (error) => {
        toast(error instanceof Error ? error.message : "Не получилось удалить");
        onClose();
      },
    });

  return (
    <Dialog open onClose={() => !remove.isPending && onClose()} title="Удалить карточку" width="sm">
      <div className="flex flex-col gap-4" data-testid="delete-dialog">
        <div className="flex items-center gap-3">
          <Face person={person} size={44} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-5" data-testid="delete-name">
              {person.full_name}
            </p>
            <p className="truncate text-[13px] leading-[18px] text-muted">{roleLine(person)}</p>
          </div>
        </div>
        <p className="text-[14px] leading-5 text-muted">За карточкой нет истории: ни задач, ни сообщений, ни очков. Она исчезнет насовсем вместе со входом, вернуть её будет нельзя.</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={onClose} data-testid="delete-cancel">
            Отмена
          </Button>
          <Button size="sm" variant="danger" loading={remove.isPending} onClick={confirm} data-testid="delete-confirm">
            Удалить насовсем
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
