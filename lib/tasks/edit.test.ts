import { describe, expect, it } from "vitest";

import { canChangePerson, canEdit, draftOf, noticeOf, planOf, problemOf } from "./edit";

const NOW = new Date("2026-11-26T06:00:00Z");
const at = (iso: string) => new Date(iso).toISOString();

const task = (patch: Partial<Parameters<typeof draftOf>[0]> = {}) => ({
  title: "Позвонить поставщику",
  body: null,
  priority: "normal" as const,
  deadline: at("2026-11-27T13:00:00Z"),
  status: "accepted" as const,
  assignee_id: "p-erlan",
  scheduled_send_at: null,
  assignee: { full_name: "Ерлан Бекович" },
  ...patch,
});

describe("«Изменить задачу» (D-200)", () => {
  it("opens for every open task; closed work stays history", () => {
    for (const status of ["scheduled", "sent", "accepted", "in_progress", "rework", "pending_review", "declined"] as const) expect(canEdit(status)).toBe(true);
    expect(canEdit("done")).toBe(false);
    expect(canEdit("revoked")).toBe(false);
  });

  it("handed-in work keeps its person until it is judged", () => {
    expect(canChangePerson("pending_review")).toBe(false);
    expect(canChangePerson("accepted")).toBe(true);
    expect(canChangePerson("scheduled")).toBe(true);
    expect(canChangePerson("declined")).toBe(true);
    expect(canChangePerson("done")).toBe(false);
  });

  it("the form starts from the task and sends nothing that did not change", () => {
    const base = task();
    const draft = draftOf(base);
    expect(draft).toEqual({ title: "Позвонить поставщику", body: "", urgent: false, deadline: base.deadline, assigneeId: "p-erlan", assigneeName: "Ерлан Бекович", note: "" });
    expect(planOf(base, draft)).toEqual({ changed: false, title: "Позвонить поставщику", body: null });
    // spaces around the words are not a change
    expect(planOf(base, { ...draft, title: "  Позвонить поставщику ", body: "  " }).changed).toBe(false);
    // the same moment written another way is not a new deadline
    expect(planOf(base, { ...draft, deadline: "2026-11-27T18:00:00+05:00" }).deadline).toBeUndefined();
  });

  it("the words always, «срочно», the date and the person only when they change", () => {
    const base = task();
    const draft = draftOf(base);
    expect(planOf(base, { ...draft, title: "Позвонить насчёт цемента", body: "цена за тонну " })).toEqual({
      changed: true,
      title: "Позвонить насчёт цемента",
      body: "цена за тонну",
    });
    expect(planOf(base, { ...draft, urgent: true }).priority).toBe("high");
    expect(planOf(task({ priority: "high" }), { ...draftOf(task({ priority: "high" })), urgent: false }).priority).toBe("normal");
    // a low priority the parser gave is kept while «срочно» stays off
    expect(planOf(task({ priority: "low" }), draftOf(task({ priority: "low" }))).priority).toBeUndefined();
    expect(planOf(base, { ...draft, deadline: null }).deadline).toEqual({ iso: null });
    expect(planOf(base, { ...draft, assigneeId: "p-marat", assigneeName: "Марат Ахметов", note: " файлы у Ерлана " })).toMatchObject({
      assignee: { id: "p-marat", name: "Марат Ахметов" },
      note: "файлы у Ерлана",
    });
    // a held task changes hands quietly: no word to send
    const held = task({ status: "scheduled", scheduled_send_at: at("2026-11-26T08:00:00Z") });
    expect(planOf(held, { ...draftOf(held), assigneeId: "p-marat", assigneeName: "Марат", note: "привет" }).note).toBeUndefined();
  });

  it("says what stops the save at its field", () => {
    const base = task();
    const draft = draftOf(base);
    expect(problemOf(base, { ...draft, title: "   " }, NOW)).toEqual({ field: "title", text: "Без текста задачу не сохранить" });
    expect(problemOf(base, { ...draft, deadline: at("2026-11-26T05:00:00Z") }, NOW)?.field).toBe("deadline");
    // an overdue task may still change its words without a new date
    const overdue = task({ deadline: at("2026-11-25T13:00:00Z") });
    expect(problemOf(overdue, { ...draftOf(overdue), title: "Позвонить — уточнено" }, NOW)).toBeNull();
    // …but a new person needs a deadline still ahead
    expect(problemOf(overdue, { ...draftOf(overdue), assigneeId: "p-marat", assigneeName: "Марат Ахметов" }, NOW)?.text).toBe(
      "Срок прошёл или вот-вот — назначьте новый для: Марат",
    );
    expect(problemOf(overdue, { ...draftOf(overdue), assigneeId: "p-marat", assigneeName: "Марат", deadline: at("2026-11-28T13:00:00Z") }, NOW)).toBeNull();
    // a held task: the deadline after it goes out
    const held = task({ status: "scheduled", scheduled_send_at: at("2026-11-27T03:00:00Z") });
    expect(problemOf(held, { ...draftOf(held), deadline: at("2026-11-27T02:00:00Z") }, NOW)?.text).toBe("Задача уйдёт позже этого срока — выберите позже");
  });

  it("tells who learns of it", () => {
    const base = task();
    const draft = draftOf(base);
    const names = { now: "Ерлан" };
    expect(noticeOf(base, planOf(base, draft), names)).toBe("Пока ничего не изменено");
    expect(noticeOf(base, planOf(base, { ...draft, title: "Новое" }), names)).toBe(
      "Ерлан получит уведомление «Задача изменена», в переписке останется, что было. Принимать заново не нужно",
    );
    expect(noticeOf(base, planOf(base, { ...draft, assigneeId: "p-marat", assigneeName: "Марат Ахметов" }), { now: "Ерлан", next: "Марат" })).toBe(
      "Марат получит задачу заново, уже с правкой. Ерлан увидит у себя «Задача передана»",
    );
    const refused = task({ status: "declined" });
    expect(noticeOf(refused, planOf(refused, { ...draftOf(refused), title: "Новое" }), names)).toBe(
      "Ерлан получит уведомление «Задача изменена». Задача по-прежнему с отказом — в работу её вернёт «Настоять»",
    );
    const handedIn = task({ status: "pending_review" });
    expect(noticeOf(handedIn, planOf(handedIn, { ...draftOf(handedIn), title: "Новое" }), names)).toBe(
      "Ерлан получит уведомление «Задача изменена». Сданная работа по-прежнему ждёт вашей проверки",
    );
    const held = task({ status: "scheduled" });
    expect(noticeOf(held, planOf(held, { ...draftOf(held), title: "Новое" }), names)).toBe("Задача ещё не ушла — уйдёт уже с правкой, отдельного уведомления не будет");
  });
});
