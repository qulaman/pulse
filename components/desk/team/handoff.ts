import type { Handed } from "./LoginBlock";

/**
 * The login of a person just created on `/desk/team/new`, handed to their card (tasks/022
 * B.3): «Добавить» leads to the card, and the card issues the code (or shows the email and the
 * first password) once. Kept in this tab's memory only — a reload or a later visit to the card
 * finds nothing and issues nothing; a password never touches storage.
 */
const handed = new Map<string, Handed>();

export function handOver(id: string, login: Handed): void {
  handed.set(id, login);
}

/** What was handed to this card, without taking it — a Strict Mode double render reads it twice. */
export function peekHandover(id: string): Handed | null {
  return handed.get(id) ?? null;
}

/** Taken: the card has it in its own state now. */
export function dropHandover(id: string): void {
  handed.delete(id);
}
