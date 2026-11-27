import { Brush, MonitorUp } from "lucide-react";

import type { MenuItem } from "@/components/desk/ui/Menu";
import { openWords } from "@/components/mindboard/carry";
import { EXTEND_MINUTES } from "@/components/mindboard/WallSheet";
import { NoteIcon } from "@/components/notes/icons";
import { toast } from "@/components/ui/Toast";
import type { BoardSummary } from "@/lib/mindboard/list";
import type { MindBoard } from "@/lib/mindboard/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import { tvTime } from "@/lib/tv/clock";

/** What the head of a desk board counts: its points, what can be handed out, carried, unticked. */
export type BoardCounts = {
  summary: Pick<BoardSummary, "total" | "subs" | "done">;
  /** Points with words, no task yet, on the server. */
  toHand: number;
  /** Open points «Новая доска из открытых» would take. */
  open: number;
  ticks: number;
  handed: number;
};

/** The commands «⋯» runs; the menu adds its own words and toasts. */
export type BoardCommands = {
  rename: () => void;
  pin: (on: boolean) => void;
  handout: () => void;
  sketch: () => void;
  carry: () => void;
  untick: () => void;
  copy: () => void;
  extend: () => void;
  look: () => void;
  eject: () => void;
  finish: (on: boolean) => void;
  bin: () => void;
};

const pointsWord = (n: number) => `${n} ${pluralRu(n, ["пункт", "пункта", "пунктов"])}`;

/** «⋯» of a desk board (D-177): the board's own actions, the wall's, then finishing and the bin. */
export function boardMenu(board: MindBoard, onWall: boolean, counts: BoardCounts, run: BoardCommands): MenuItem[] {
  const { summary, toHand, open, ticks } = counts;
  return [
    { key: "rename", label: "Переименовать", hint: "F2", icon: <NoteIcon name="pencil" size={14} />, onSelect: run.rename },
    {
      key: "pin",
      label: board.pinned_at ? "Открепить" : "Закрепить сверху",
      icon: <NoteIcon name="pin" size={14} />,
      onSelect: () => {
        run.pin(!board.pinned_at);
        toast(board.pinned_at ? "Открепил" : "Закрепил первой в «Досках»");
      },
    },
    ...(toHand > 0 ? [{ key: "handout", label: "Раздать поручения", icon: <NoteIcon name="task" size={14} />, onSelect: run.handout }] : []),
    { key: "sketch", label: "Рисунок — новым пунктом…", icon: <Brush aria-hidden size={14} />, onSelect: run.sketch },
    ...(open > 0 ? [{ key: "copy", label: `Новая доска из открытых · ${openWords(open)}`, icon: <NoteIcon name="stack" size={14} />, onSelect: run.carry }] : []),
    ...(ticks > 0 ? [{ key: "untick", label: `Снять все отметки · ${ticks}`, icon: <NoteIcon name="retry" size={14} />, onSelect: run.untick }] : []),
    ...(summary.total > 0 ? [{ key: "text", label: "Скопировать текстом", icon: <NoteIcon name="copy" size={14} />, onSelect: run.copy }] : []),
    "separator",
    ...(onWall
      ? [
          { key: "extend", label: `Ещё ${EXTEND_MINUTES} минут на стене`, icon: <NoteIcon name="wall" size={14} />, onSelect: run.extend },
          { key: "look", label: "Вид и время на стене…", icon: <MonitorUp aria-hidden size={14} />, onSelect: run.look },
          { key: "eject", label: "Убрать со стены", icon: <NoteIcon name="x" size={14} />, onSelect: run.eject },
        ]
      : [{ key: "look", label: "Вид, время, доска недели…", icon: <MonitorUp aria-hidden size={14} />, onSelect: run.look }]),
    "separator",
    {
      key: "finish",
      label: board.finished_at ? "Вернуть в работу" : "Завершить доску",
      icon: <NoteIcon name={board.finished_at ? "restore" : "flag"} size={14} />,
      onSelect: () => {
        run.finish(!board.finished_at);
        toast(board.finished_at ? "Доска снова в работе" : "Доска завершена — она в «Завершённых»");
      },
    },
    { key: "delete", label: "В корзину", danger: true, icon: <NoteIcon name="trash" size={14} />, onSelect: run.bin },
  ];
}

/** The state of the board said once, under its title: the wall first while it is up. */
export function boardStateLine(board: MindBoard, counts: BoardCounts, at: { until: Date | null; online: boolean }): string {
  const { summary, handed } = counts;
  return [
    at.until ? `на стене до ${tvTime(at.until)}` : "",
    summary.total > 0 ? pointsWord(summary.total) : "Пока пусто",
    summary.subs > 0 ? `${summary.subs} ${pluralRu(summary.subs, ["подпункт", "подпункта", "подпунктов"])}` : "",
    summary.done > 0 ? `${summary.done} ${pluralRu(summary.done, ["отмечен", "отмечено", "отмечено"])}` : "",
    handed > 0 ? `${handed} ${pluralRu(handed, ["поручен", "поручено", "поручено"])}` : "",
    board.finished_at ? "завершена" : board.pinned_at ? "закреплена" : "",
    !at.online ? "нет связи — строки ждут на этом компьютере" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
