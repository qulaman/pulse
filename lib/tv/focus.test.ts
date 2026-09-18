import { describe, expect, it } from "vitest";

import { focusRows } from "./focus";
import type { TvFocusEmployee, TvFocusTask } from "./queries";

const NOW = new Date("2026-09-18T09:00:00Z"); // 14:00 в Актобе

function focus(tasks: Partial<TvFocusTask>[], guest = false): TvFocusEmployee {
  return {
    mode: "employee",
    guest,
    expires_at: "2026-09-18T09:10:00Z",
    employee: { id: "e1", name: guest ? "Марат" : "Марат Оспанов", position: "Специалист" },
    tasks: tasks.map((task, index) => ({
      id: task.id ?? `t${index}`,
      title: "title" in task ? task.title ?? null : "Подписать акт",
      status: task.status ?? "sent",
      deadline: task.deadline ?? null,
    })),
  };
}

describe("focusRows", () => {
  it("даёт слово и тон по статусу", () => {
    const rows = focusRows(
      focus([{ status: "sent" }, { status: "accepted" }, { status: "pending_review" }]),
      NOW,
    );
    expect(rows.map((row) => row.status)).toEqual(["новая", "в работе", "на проверке"]);
    expect(rows.map((row) => row.tone)).toEqual(["accent", "ok", "muted"]);
  });

  it("доработку печатает как работу — негатив по имени на стену не выносится (D-45)", () => {
    const [row] = focusRows(focus([{ status: "rework" }]), NOW);
    expect(row.status).toBe("в работе");
    expect(row.tone).toBe("ok");
  });

  it("срок — сегодня со временем, завтра словом, дальше датой", () => {
    const rows = focusRows(
      focus([
        { deadline: "2026-09-18T13:00:00Z" }, // 18:00 в Актобе
        { deadline: "2026-09-19T05:00:00Z" },
        { deadline: "2026-09-22T05:00:00Z" },
      ]),
      NOW,
    );
    expect(rows.map((row) => row.deadline)).toEqual(["сегодня 18:00", "завтра", "до 22 сен"]);
  });

  it("прошедший срок печатается нейтрально: ни «просрочено», ни красного (D-45)", () => {
    const [row] = focusRows(focus([{ status: "accepted", deadline: "2026-09-15T05:00:00Z" }]), NOW);
    expect(row.deadline).toBe("до 15 сен");
    expect(row.deadline).not.toMatch(/просроч/i);
    expect(row.status).not.toMatch(/просроч/i);
    expect(row.tone).not.toBe("danger");
  });

  it("без срока — пусто, у гостя вместо заголовка «Поручение»", () => {
    const rows = focusRows(focus([{ title: null, deadline: null }], true), NOW);
    expect(rows[0].deadline).toBeNull();
    expect(rows[0].title).toBe("Поручение");
  });
});
