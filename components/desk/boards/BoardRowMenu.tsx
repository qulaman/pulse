"use client";

import { useState } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { MoreMenu } from "@/components/desk/ui/IconButton";
import type { MenuItem } from "@/components/desk/ui/Menu";
import { NoteIcon } from "@/components/notes/icons";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { cleanTitle } from "@/lib/mindboard/list";
import { useFinishBoard, usePinBoard, useRenameBoard } from "@/lib/mindboard/mutations";
import type { MindBoard } from "@/lib/mindboard/queries";

/**
 * The actions of a board without opening it (D-140, D-177): rename, pin, finish, to the bin — the
 * desk's «⋯» under a sheet of the gallery (and `boardMenuItems` for a right click). «В корзину»
 * here and in the board's own head do the same: the board goes at once, the toast brings it back.
 */
export function BoardRowMenu({ board, me, onBin }: { board: MindBoard; me: { userId: string } | undefined; onBin: (board: MindBoard) => void }) {
  const [renaming, setRenaming] = useState(false);
  const pin = usePinBoard(me);
  const finish = useFinishBoard(me);
  const items = boardMenuItems(board, { pin, finish, onBin, onRename: () => setRenaming(true) });

  return (
    <>
      <MoreMenu items={items} label={`Действия с доской «${board.title}»`} width={248} testId="desk-board-menu" />
      <RenameBoardDialog board={board} me={me} open={renaming} onClose={() => setRenaming(false)} />
    </>
  );
}

type BoardWrites = {
  pin: ReturnType<typeof usePinBoard>;
  finish: ReturnType<typeof useFinishBoard>;
  onBin: (board: MindBoard) => void;
  onRename: () => void;
};

/** What a board can do from the list: the items of its «⋯» and of its right click. */
export function boardMenuItems(board: MindBoard, { pin, finish, onBin, onRename }: BoardWrites): MenuItem[] {
  return [
    { key: "rename", label: "Переименовать", icon: <NoteIcon name="pencil" size={14} />, onSelect: onRename },
    board.finished_at
      ? { key: "finish", label: "Вернуть в работу", icon: <NoteIcon name="restore" size={14} />, onSelect: () => finish.mutate({ id: board.id, on: false }, { onSuccess: () => toast("Доска снова в работе") }) }
      : {
          key: "pin",
          label: board.pinned_at ? "Открепить" : "Закрепить сверху",
          icon: <NoteIcon name="pin" size={14} />,
          onSelect: () => {
            pin.mutate({ id: board.id, on: !board.pinned_at });
            toast(board.pinned_at ? "Открепил" : "Закрепил сверху списка");
          },
        },
    ...(board.finished_at
      ? []
      : [
          {
            key: "finish",
            label: "Завершить доску",
            icon: <NoteIcon name="flag" size={14} />,
            onSelect: () => finish.mutate({ id: board.id, on: true }, { onSuccess: () => toast("Доска завершена — она в «Завершённых»") }),
          },
        ]),
    "separator",
    { key: "delete", label: "В корзину", danger: true, icon: <NoteIcon name="trash" size={14} />, onSelect: () => onBin(board) },
  ];
}

/** «Переименовать»: the title in a small dialog, Enter keeps it. */
export function RenameBoardDialog({ board, me, open, onClose }: { board: MindBoard; me: { userId: string } | undefined; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Переименовать доску" width="sm">
      {open ? <RenameBody board={board} me={me} onClose={onClose} /> : null}
    </Dialog>
  );
}

function RenameBody({ board, me, onClose }: { board: MindBoard; me: { userId: string } | undefined; onClose: () => void }) {
  const rename = useRenameBoard(me);
  const [title, setTitle] = useState(board.title);
  const save = () => {
    const next = cleanTitle(title, board.title);
    if (next !== board.title) rename.mutate({ id: board.id, title: next });
    onClose();
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <label className="field flex h-10 items-center px-3">
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
        <Button size="sm" variant="secondary" type="button" onClick={onClose}>
          Отмена
        </Button>
        <Button size="sm" type="submit">
          Сохранить
        </Button>
      </div>
    </form>
  );
}
