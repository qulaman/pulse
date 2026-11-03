"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { BoardMenu, type BoardMenuItem } from "@/components/mindboard/BoardMenu";
import { NoteIcon } from "@/components/notes/icons";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { cleanTitle } from "@/lib/mindboard/list";
import { useDeleteBoard, useFinishBoard, usePinBoard, useRenameBoard, useRestoreBoard } from "@/lib/mindboard/mutations";
import type { MindBoard } from "@/lib/mindboard/queries";

/**
 * «⋯» of a board in the list (D-140): the board's menu — rename, pin, finish, delete — without
 * opening it. The board itself has the same menu and more on the right.
 */
export function BoardRowMenu({ board, me }: { board: MindBoard; me: { userId: string } | undefined }) {
  const router = useRouter();
  const rename = useRenameBoard(me);
  const pin = usePinBoard(me);
  const finish = useFinishBoard(me);
  const remove = useDeleteBoard(me);
  const restore = useRestoreBoard(me);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(board.title);

  const items: BoardMenuItem[] = [
    {
      key: "rename",
      label: "Переименовать",
      icon: "pencil",
      sheet: true,
      run: () => {
        setTitle(board.title);
        setRenaming(true);
      },
    },
    board.finished_at
      ? { key: "finish", label: "Вернуть в работу", icon: "restore", run: () => finish.mutate({ id: board.id, on: false }, { onSuccess: () => toast("Доска снова в работе") }) }
      : {
          key: "pin",
          label: board.pinned_at ? "Открепить" : "Закрепить сверху",
          icon: "pin",
          run: () => {
            pin.mutate({ id: board.id, on: !board.pinned_at });
            toast(board.pinned_at ? "Открепил" : "Закрепил сверху списка");
          },
        },
    ...(board.finished_at
      ? []
      : [{ key: "finish", label: "Завершить доску", detail: "уйдёт в «Завершённые», целиком", icon: "flag" as const, run: () => finish.mutate({ id: board.id, on: true }, { onSuccess: () => toast("Доска завершена — она в «Завершённых»") }) }]),
    {
      key: "delete",
      label: "Удалить доску",
      icon: "trash",
      danger: true,
      run: () => {
        remove.mutate({ id: board.id });
        toast("Доска в корзине", { action: { label: "Вернуть", onClick: () => restore.mutate({ id: board.id }) } });
        if (window.location.pathname === `/desk/notes/b/${board.id}`) router.push("/desk/notes?tab=boards");
      },
    },
  ];

  const save = () => {
    const next = cleanTitle(title, board.title);
    if (next !== board.title) rename.mutate({ id: board.id, title: next });
    setRenaming(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label={`Действия с доской «${board.title}»`}
        title="Действия с доской"
        data-testid="desk-board-menu"
        onClick={(event) => {
          // the row's own click opens the board
          event.stopPropagation();
          setMenu(true);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-[8px] text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5.5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="18.5" cy="12" r="1.7" />
        </svg>
      </button>
      <BoardMenu open={menu} onClose={() => setMenu(false)} title={board.title} items={items} />
      <Dialog open={renaming} onClose={() => setRenaming(false)} title="Переименовать доску" width="sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <label className="field flex h-10 items-center px-3">
            <NoteIcon name="board" size={15} className="mr-2 shrink-0 text-muted" />
            <input
              data-autofocus
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="Название доски"
              className="min-w-0 flex-1 bg-transparent text-[14px] leading-5 outline-none"
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setRenaming(false)}>
              Отмена
            </Button>
            <Button size="sm" type="submit">
              Сохранить
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
