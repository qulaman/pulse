"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { Kbd } from "@/components/desk/ui/Kbd";
import { taskIdIn } from "@/components/ops/company/words";
import { useCompanies } from "@/lib/ops/queries";

type Item = { key: string; title: string; hint?: string; href: string; task?: { company: string; id: string } };

/** A task number sent to the company on screen: its section may be open already and takes it from here. */
export const TASK_JUMP = "ops-task-jump";

const PAGES: Item[] = [
  { key: "new", title: "Новая компания", href: "/ops/new" },
  { key: "log", title: "Журнал", href: "/ops/log" },
  { key: "operators", title: "Разработчики", href: "/ops/operators" },
];

const LIMIT = 8;

/** A key typed into a field is text, not a command. */
export function typingIn(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  const tag = element?.tagName?.toLowerCase();
  return Boolean(element?.isContentEditable) || tag === "input" || tag === "textarea" || tag === "select";
}

function JumpDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const companies = useCompanies();
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);

  const text = query.trim();
  const pasted = taskIdIn(text);
  const here = pathname.match(/^\/ops\/c\/([^/]+)/)?.[1] ?? null;

  const { items, note } = useMemo<{ items: Item[]; note: string | null }>(() => {
    const rows = companies.data ?? [];
    // a pasted id that names no company is a task's: it is looked for inside one company
    if (pasted && !rows.some((row) => row.id === pasted)) {
      const own = [...rows].sort((a, b) => Number(b.id === here) - Number(a.id === here));
      return {
        items: own.slice(0, LIMIT).map((row) => ({ key: row.id, title: row.name, hint: row.id === here ? "открыта сейчас" : undefined, href: `/ops/c/${row.id}?s=task&task=${pasted}`, task: { company: row.id, id: pasted } })),
        note: "Это номер задачи? Выбери компанию, в которой её искать",
      };
    }
    const words = text.toLowerCase();
    const found = rows.filter((row) => !words || [row.name, row.slug, row.id].some((value) => value?.toLowerCase().includes(words)));
    return {
      items: [
        ...found.slice(0, LIMIT).map((row) => ({ key: row.id, title: row.name, hint: row.slug ?? undefined, href: `/ops/c/${row.id}` })),
        ...PAGES.filter((page) => !words || page.title.toLowerCase().includes(words)),
      ],
      note: null,
    };
  }, [companies.data, here, pasted, text]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    router.push(item.href);
    if (item.task) window.dispatchEvent(new CustomEvent(TASK_JUMP, { detail: item.task }));
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.code === "ArrowDown" || event.code === "ArrowUp") {
      event.preventDefault();
      const step = event.code === "ArrowDown" ? 1 : -1;
      setAt((index) => (index + step + items.length) % Math.max(1, items.length));
    } else if (event.code === "Enter" || event.code === "NumpadEnter") {
      event.preventDefault();
      go(items[at]);
    }
  };

  return (
    <Dialog open onClose={onClose} width="md">
      <div className="flex flex-col gap-2 pt-6" data-testid="ops-jump">
        <input
          data-autofocus
          value={query}
          aria-label="Куда перейти"
          placeholder="Компания, раздел или номер задачи"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setAt(0);
          }}
          onKeyDown={onKeyDown}
          className="field h-9 w-full px-3 text-[14px] leading-5"
          data-testid="ops-jump-input"
        />
        {note ? <p className="px-1 text-[12px] leading-4 text-muted">{note}</p> : null}
        {items.length > 0 ? (
          <ul className="flex flex-col" role="listbox" aria-label="Найдено">
            {items.map((item, index) => (
              <li key={item.key} role="option" aria-selected={index === at}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseEnter={() => setAt(index)}
                  onClick={() => go(item)}
                  className={`flex h-8 w-full items-center gap-3 rounded-[6px] px-2 text-left text-[13px] leading-5 ${index === at ? "bg-surface-2" : ""}`}
                >
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {item.hint ? <span className="shrink-0 text-[12px] leading-4 text-muted">{item.hint}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1 py-2 text-[13px] leading-5 text-muted">{companies.isPending ? "Загружаю список компаний" : "Ничего не нашлось"}</p>
        )}
      </div>
    </Dialog>
  );
}

/**
 * Ctrl+K from any screen: a company by a piece of its name, a page of the console, or a pasted
 * task number. Off while another dialog is up: a jump would lose what is typed there.
 */
export function Jump() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyK") return;
      event.preventDefault();
      if (document.body.hasAttribute("data-dialog-open")) return;
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="desk-focus flex h-8 w-full items-center gap-2 rounded-[6px] border border-border px-2.5 text-left text-[13px] leading-5 text-muted hover:text-text"
        data-testid="ops-jump-open"
      >
        <span className="min-w-0 flex-1 truncate">Перейти</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      {open ? <JumpDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}
