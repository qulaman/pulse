/**
 * A person's task counts on the phone's card (2.5): one word, one set. «Закрыто» is what the director
 * accepted (`done`) — the same rule the person's own profile counts (`lib/profile/stats.ts`, status
 * `done`, `closed_at` within 30 days). Finished otherwise — refused, recalled — is not «закрыто»:
 * the card's list of all finished tasks is «История», not a second «Закрытые» with another number.
 * Pure.
 */
import { pluralRu, type TaskStatus } from "@/lib/tasks/status-text";

export const CLOSED_WINDOW_MS = 30 * 86_400_000;

/** Finished, whichever way: accepted, refused, recalled — the card's «История». */
export const FINISHED: readonly TaskStatus[] = ["done", "declined", "revoked"];

type CountTask = { status: TaskStatus; closed_at: string | null };

/** «N закрыто за 30 дн.»: accepted by the director within the last 30 days. */
export function closedIn30(tasks: readonly CountTask[], now: number): number {
  return tasks.filter((task) => task.status === "done" && task.closed_at !== null && now - Date.parse(task.closed_at) < CLOSED_WINDOW_MS).length;
}

/** The card's «История · N»: every finished task, all time. */
export function finishedOf<T extends CountTask>(tasks: readonly T[]): T[] {
  return tasks.filter((task) => FINISHED.includes(task.status));
}

/**
 * «1 задача в работе · 1 на проверке · 2 не приняты» — the stages that have anything, the noun once,
 * on the first of them; nothing at all when nothing is open.
 */
export function taskStageParts(working: number, review: number, waiting: number): string[] {
  const parts: [number, (n: number) => string][] = [
    [working, () => "в работе"],
    [review, () => "на проверке"],
    [waiting, (n) => `не ${pluralRu(n, ["принята", "приняты", "приняты"])}`],
  ];
  return parts
    .filter(([n]) => n > 0)
    .map(([n, tail], index) => (index === 0 ? `${n} ${pluralRu(n, ["задача", "задачи", "задач"])} ${tail(n)}` : `${n} ${tail(n)}`));
}
