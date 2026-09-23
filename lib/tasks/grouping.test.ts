import { describe, expect, it } from "vitest";

import type { TaskStatus } from "./status-text";
import { bucketOf, groupTasks, nearestDeadline, overdueCount, TIME_BUCKETS, type Groupable } from "./grouping";

// 2026-09-17 12:00 Aqtobe (UTC+5)
const NOW = new Date("2026-09-17T07:00:00Z");

let seq = 0;

function task(extra: Partial<Groupable> & { status?: TaskStatus } = {}): Groupable {
  seq += 1;
  return {
    id: `t-${seq}`,
    status: "sent",
    deadline: null,
    priority: "normal",
    created_at: `2026-09-1${seq % 9}T06:00:00Z`,
    assignee: { full_name: "Марат Оспанов" },
    ...extra,
  };
}

/** Aqtobe wall clock: 18:00 local is 13:00 UTC. */
const at = (day: string, hour = 18) => `2026-09-${day}T${String(hour - 5).padStart(2, "0")}:00:00Z`;

describe("bucketOf", () => {
  it("sorts a deadline into its pile", () => {
    expect(bucketOf(task({ deadline: at("16") }), NOW)).toBe("overdue");
    expect(bucketOf(task({ deadline: at("17") }), NOW)).toBe("today");
    expect(bucketOf(task({ deadline: at("18") }), NOW)).toBe("tomorrow");
    expect(bucketOf(task({ deadline: at("22") }), NOW)).toBe("week");
    expect(bucketOf(task({ deadline: at("30") }), NOW)).toBe("later");
    expect(bucketOf(task({ deadline: null }), NOW)).toBe("none");
  });

  it("a deadline earlier today is already overdue", () => {
    expect(bucketOf(task({ deadline: at("17", 9) }), NOW)).toBe("overdue");
  });

  it("«срочно» without a deadline means now, not «когда-нибудь»", () => {
    expect(bucketOf(task({ priority: "high", deadline: null }), NOW)).toBe("urgent");
    // a deadline of its own wins: the date says when, the flag only says how loudly
    expect(bucketOf(task({ priority: "high", deadline: at("18") }), NOW)).toBe("tomorrow");
    expect(bucketOf(task({ priority: "high", deadline: at("16") }), NOW)).toBe("overdue");
    expect(bucketOf(task({ status: "done", priority: "high", deadline: null }), NOW)).toBe("closed");
  });

  it("work handed in waits in its own pile, whatever its date says", () => {
    expect(bucketOf(task({ status: "pending_review", deadline: null }), NOW)).toBe("review");
    expect(bucketOf(task({ status: "pending_review", deadline: at("16") }), NOW)).toBe("review");
    expect(bucketOf(task({ status: "pending_review", priority: "high", deadline: null }), NOW)).toBe("review");
  });

  it("closed work is history, never «просрочено»", () => {
    for (const status of ["done", "declined", "revoked"] as TaskStatus[]) {
      expect(bucketOf(task({ status, deadline: at("10") }), NOW)).toBe("closed");
    }
  });
});

describe("groupTasks by deadline", () => {
  it("keeps the piles in the order of what burns first and drops the empty ones", () => {
    const groups = groupTasks(
      [
        task({ deadline: at("30") }),
        task({ deadline: null }),
        task({ deadline: at("16") }),
        task({ status: "done", deadline: at("16") }),
        task({ deadline: at("17") }),
      ],
      "deadline",
      NOW,
    );
    expect(groups.map((g) => g.key)).toEqual(["overdue", "today", "later", "none", "closed"]);
    expect(groups.map((g) => g.title)).toEqual(["Просрочено", "Сегодня", "Позже", "Без срока", "Закрытые"]);
  });

  it("«Срочно» stands right under «Просрочено», above the dated piles", () => {
    const groups = groupTasks(
      [task({ deadline: at("18") }), task({ priority: "high", deadline: null }), task({ deadline: at("16") }), task({ deadline: null })],
      "deadline",
      NOW,
    );
    expect(groups.map((g) => g.key)).toEqual(["overdue", "urgent", "tomorrow", "none"]);
  });

  it("inside a pile the nearest deadline comes first", () => {
    const late = task({ deadline: at("22", 9) });
    const early = task({ deadline: at("19") });
    const [week] = groupTasks([late, early], "deadline", NOW);
    expect(week.tasks.map((t) => t.id)).toEqual([early.id, late.id]);
  });

  it("undated tasks come newest first", () => {
    const old = task({ deadline: null, created_at: "2026-09-01T06:00:00Z" });
    const fresh = task({ deadline: null, created_at: "2026-09-16T06:00:00Z" });
    const [none] = groupTasks([old, fresh], "deadline", NOW);
    expect(none.tasks.map((t) => t.id)).toEqual([fresh.id, old.id]);
  });
});

describe("«На приёмке» stands where the next move is", () => {
  const rows = [
    task({ deadline: at("18") }),
    task({ status: "pending_review", deadline: null }),
    task({ deadline: at("16") }),
    task({ deadline: null }),
  ];

  it("near the top for the director, whose move it is", () => {
    const groups = groupTasks(rows, "deadline", NOW, { reviewFirst: true });
    expect(groups.map((g) => g.key)).toEqual(["overdue", "review", "tomorrow", "none"]);
    expect(groups[1].title).toBe("На приёмке");
  });

  it("at the foot for the employee, who cannot move it", () => {
    const groups = groupTasks(rows, "deadline", NOW);
    expect(groups.map((g) => g.key)).toEqual(["overdue", "tomorrow", "none", "review"]);
  });

  it("the time piles keep their order in both", () => {
    expect(TIME_BUCKETS).toEqual(["today", "tomorrow", "week", "later", "none"]);
  });
});

describe("groupTasks without grouping", () => {
  it("is one pile, newest first, no heading", () => {
    const old = task({ created_at: "2026-09-01T06:00:00Z" });
    const fresh = task({ created_at: "2026-09-16T06:00:00Z" });
    const groups = groupTasks([old, fresh], "none", NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("");
    expect(groups[0].tasks.map((t) => t.id)).toEqual([fresh.id, old.id]);
  });

  it("nothing at all is no groups", () => {
    expect(groupTasks([], "none", NOW)).toEqual([]);
    expect(groupTasks([], "deadline", NOW)).toEqual([]);
  });
});

describe("summary", () => {
  it("nearestDeadline skips the past and the closed", () => {
    const rows = [
      task({ deadline: at("16") }),
      task({ status: "done", deadline: at("18") }),
      task({ deadline: at("22") }),
      task({ deadline: at("19") }),
    ];
    expect(nearestDeadline(rows, NOW)).toBe(at("19"));
    expect(nearestDeadline([task({ deadline: null })], NOW)).toBeNull();
  });

  it("overdueCount counts only open work past its deadline", () => {
    const rows = [
      task({ deadline: at("16") }),
      task({ status: "done", deadline: at("16") }),
      task({ deadline: at("30") }),
    ];
    expect(overdueCount(rows, NOW)).toBe(1);
  });
});
