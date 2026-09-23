import type { Role } from "@/lib/routes";

/** Somebody on the roster, as far as the rules below care. */
export type Who = { id: string; role: Role };

/** People roles in the order the role picker shows them; the kiosk is not a person. */
export const PERSON_ROLES = ["employee", "manager", "secretary", "shopkeeper", "director"] as const satisfies readonly Role[];

/**
 * The roles an editor may hand out (D-104). The director — any; the secretary — anything
 * but director, so nobody climbs by her hand. A kiosk login is created as a kiosk and
 * stays one: a person never becomes the wall and the wall never becomes a person.
 * `target` is the person's current role, `null` while the person is being created.
 */
export function assignableRoles(editor: Role, target: Role | null): Role[] {
  if (target === "tv") return ["tv"];
  const people: Role[] =
    editor === "director" ? [...PERSON_ROLES] : editor === "secretary" ? PERSON_ROLES.filter((r) => r !== "director") : [];
  return target === null && people.length > 0 ? [...people, "tv"] : people;
}

/** Whether the editor may change this person's card at all (name, position, aliases, status). */
export function canEditPerson(editor: Who, target: Who): boolean {
  if (editor.role === "director") return true;
  if (editor.role === "secretary") return target.role !== "director";
  return editor.id === target.id;
}

/**
 * Role, manager and «работает в компании»: never on one's own card — a director who
 * demotes themself or a secretary who switches herself off locks the door from inside.
 */
export function canChangeAccess(editor: Who, target: Who): boolean {
  if (editor.id === target.id) return false;
  if (editor.role !== "director" && editor.role !== "secretary") return false;
  return canEditPerson(editor, target);
}

/**
 * Login (password and email): the director — anyone but another director; the secretary —
 * anyone but a director. Taking over a director's login is the one escalation that matters.
 */
export function canResetLogin(editor: Who, target: Who): boolean {
  if (editor.role === "director") return target.role !== "director" || target.id === editor.id;
  if (editor.role === "secretary") return target.role !== "director";
  return false;
}
