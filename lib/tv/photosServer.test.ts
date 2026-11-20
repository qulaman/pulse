import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { inCompanyFolder, loadTvPhotos, PER_TASK, RECENT_LIMIT, SIGN_SECONDS, TASK_LIMIT } = await import("./photosServer");

type Row = Record<string, unknown>;
type Filter = [op: string, column: string, value: unknown];
type Call = { table: string; filters: Filter[] };

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
// 20 November 2026, 14:00 in Aqtobe
const NOW = new Date("2026-11-20T09:00:00Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

/**
 * An in-memory PostgREST: rows of both companies sit in one base, the filters really filter. A
 * query that forgot its company would hand the other company's rows back — and the test sees it.
 */
function fakeBase(tables: Record<string, Row[]>) {
  const calls: Call[] = [];
  const signed: { bucket: string; paths: string[]; seconds: number }[] = [];

  function from(table: string) {
    const call: Call = { table, filters: [] };
    calls.push(call);
    let rows = [...(tables[table] ?? [])];
    let sort: { column: string; ascending: boolean } | null = null;
    let limit = Number.POSITIVE_INFINITY;
    const result = () => {
      const out = sort
        ? [...rows].sort((x, y) => {
            const order = String(x[sort!.column]).localeCompare(String(y[sort!.column]));
            return sort!.ascending ? order : -order;
          })
        : rows;
      return out.slice(0, limit);
    };
    const builder = {
      select: () => builder,
      eq(column: string, value: unknown) {
        call.filters.push(["eq", column, value]);
        rows = rows.filter((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        call.filters.push(["in", column, values]);
        rows = rows.filter((row) => values.includes(row[column]));
        return builder;
      },
      gte(column: string, value: string) {
        call.filters.push(["gte", column, value]);
        rows = rows.filter((row) => String(row[column]) >= value);
        return builder;
      },
      not(column: string, operator: string, value: unknown) {
        call.filters.push(["not", column, value]);
        if (operator === "is" && value === null) rows = rows.filter((row) => row[column] !== null && row[column] !== undefined);
        return builder;
      },
      order(column: string, options: { ascending: boolean }) {
        sort = { column, ascending: options.ascending };
        return builder;
      },
      limit(count: number) {
        limit = count;
        return builder;
      },
      maybeSingle: async () => ({ data: result()[0] ?? null, error: null }),
      then<T>(resolve: (value: { data: Row[]; error: null }) => T, reject?: (reason: unknown) => T) {
        return Promise.resolve({ data: result(), error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  const storage = {
    from: (bucket: string) => ({
      createSignedUrls: async (paths: string[], seconds: number) => {
        signed.push({ bucket, paths, seconds });
        return { data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}`, signedURL: null, error: null })), error: null };
      },
    }),
  };

  // the fake answers only what the loader asks: the client's full type is not worth faking
  const client = { from, storage } as unknown as Parameters<typeof loadTvPhotos>[0];
  return { client, calls, signed };
}

function task(id: string, company: string, patch: Row = {}): Row {
  return { id, company_id: company, title: `Дело ${id}`, status: "done", assignee_id: `${id}-worker`, completed_at: ago(1), ...patch };
}

function photo(id: string, taskRow: Row, hours: number, patch: Row = {}): Row {
  return {
    id,
    company_id: taskRow.company_id,
    task_id: taskRow.id,
    sender_id: taskRow.assignee_id,
    type: "photo",
    file_path: `${String(taskRow.company_id)}/${String(taskRow.id)}/${id}.jpg`,
    created_at: ago(hours),
    ...patch,
  };
}

function people(...rows: Row[]): Row[] {
  return rows.map((row) => ({ id: row.assignee_id, company_id: row.company_id, full_name: `Человек ${String(row.id)}` }));
}

/** The base both companies share: A's reports, B's reports a little newer. */
function base(extra: Partial<Record<string, Row[]>> = {}) {
  const north = task("north", A);
  const roof = task("roof", A, { status: "pending_review" });
  const old = task("old", A);
  const theirs = task("theirs", B);
  return {
    north,
    roof,
    theirs,
    tables: {
      tv_state: [
        { company_id: A, guest: false, guest_until: null },
        { company_id: B, guest: false, guest_until: null },
      ],
      tasks: [north, roof, old, theirs],
      task_messages: [
        photo("n1", north, 2),
        photo("n2", north, 3),
        // the director's photo on the order: not the report
        photo("n-boss", north, 1, { sender_id: "director-a" }),
        // a report on review: not done yet
        photo("r1", roof, 1),
        // a week and a day ago
        photo("o1", old, 8 * 24),
        // not a photo
        { ...photo("n-text", north, 1), type: "text", file_path: null },
        // the other company, newer than everything of A's
        photo("t1", theirs, 0.5),
        ...(extra.task_messages ?? []),
      ],
      profiles: [...people(north, roof, old, theirs), { id: "director-a", company_id: A, full_name: "Директор" }],
      ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== "task_messages")),
    } as Record<string, Row[]>,
  };
}

function expectCompanyOnEveryQuery(calls: Call[], company: string) {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(call.filters, `${call.table} is not bound to the company`).toContainEqual(["eq", "company_id", company]);
  }
}

describe("loadTvPhotos — the round", () => {
  it("binds every query to the caller's company", async () => {
    const { client, calls } = fakeBase(base().tables);
    await loadTvPhotos(client, A, { now: NOW });
    expect(calls.map((call) => call.table)).toEqual(["tv_state", "task_messages", "tasks", "profiles"]);
    expectCompanyOnEveryQuery(calls, A);
  });

  it("is the assignee's photos of done tasks of the last week, newest first — nobody else's", async () => {
    const { client, signed } = fakeBase(base().tables);
    const photos = await loadTvPhotos(client, A, { now: NOW });
    expect(photos.map((p) => p.id)).toEqual(["n1", "n2"]);
    expect(photos[0]).toMatchObject({
      task_id: "north",
      employee_id: "north-worker",
      name: "Человек north",
      title: "Дело north",
      at: ago(2),
      done_at: ago(1),
      url: `https://signed.test/${A}/north/n1.jpg`,
    });
    // one signing call for the list, an hour long, in the photos bucket
    expect(signed).toEqual([{ bucket: "photos", paths: [`${A}/north/n1.jpg`, `${A}/north/n2.jpg`], seconds: SIGN_SECONDS }]);
    expect(SIGN_SECONDS).toBe(3600);
  });

  it("the other company sees only its own", async () => {
    const { client, calls } = fakeBase(base().tables);
    const photos = await loadTvPhotos(client, B, { now: NOW });
    expect(photos.map((p) => p.id)).toEqual(["t1"]);
    expectCompanyOnEveryQuery(calls, B);
  });

  it(`keeps ${RECENT_LIMIT} at most and ${PER_TASK} of one report`, async () => {
    const { tables } = base();
    const many = Array.from({ length: 8 }, (_, i) => task(`t${i}`, A));
    tables.tasks.push(...many);
    tables.profiles.push(...people(...many));
    for (const [i, row] of many.entries()) {
      for (let k = 0; k < 4; k += 1) tables.task_messages.push(photo(`t${i}-${k}`, row, 0.1 + i * 0.1 + k * 0.01));
    }
    const { client } = fakeBase(tables);
    const photos = await loadTvPhotos(client, A, { now: NOW });
    expect(photos).toHaveLength(RECENT_LIMIT);
    const perTask = new Map<string, number>();
    for (const p of photos) perTask.set(p.task_id, (perTask.get(p.task_id) ?? 0) + 1);
    expect(Math.max(...perTask.values())).toBe(PER_TASK);
    // newest first
    expect([...photos].sort((x, y) => y.at.localeCompare(x.at)).map((p) => p.id)).toEqual(photos.map((p) => p.id));
  });

  it("nothing in the week — no names asked, nothing signed", async () => {
    const { client, calls, signed } = fakeBase({ ...base().tables, task_messages: [] });
    expect(await loadTvPhotos(client, A, { now: NOW })).toEqual([]);
    expect(calls.map((call) => call.table)).toEqual(["tv_state", "task_messages"]);
    expect(signed).toEqual([]);
  });
});

describe("loadTvPhotos — one order", () => {
  it("is that task's photos at any stage, the director's too", async () => {
    const { client, calls } = fakeBase(base().tables);
    const roof = await loadTvPhotos(client, A, { taskId: "roof", now: NOW });
    expect(roof.map((p) => p.id)).toEqual(["r1"]);
    expect(roof[0]?.done_at).toBe(ago(1));
    const north = await loadTvPhotos(client, A, { taskId: "north", now: NOW });
    expect(north.map((p) => p.id)).toEqual(["n-boss", "n1", "n2"]);
    expectCompanyOnEveryQuery(calls, A);
  });

  it("another company's task is nothing — not a single message read, nothing signed", async () => {
    const { client, calls, signed } = fakeBase(base().tables);
    expect(await loadTvPhotos(client, A, { taskId: "theirs", now: NOW })).toEqual([]);
    expect(calls.map((call) => call.table)).toEqual(["tv_state", "tasks"]);
    expectCompanyOnEveryQuery(calls, A);
    expect(signed).toEqual([]);
  });

  it(`keeps the last ${TASK_LIMIT}`, async () => {
    const { tables, north } = base();
    for (let k = 0; k < TASK_LIMIT + 3; k += 1) tables.task_messages.push(photo(`more-${k}`, north, 0.1 + k * 0.01));
    const { client } = fakeBase(tables);
    const photos = await loadTvPhotos(client, A, { taskId: "north", now: NOW });
    expect(photos.map((p) => p.id)).toEqual(Array.from({ length: TASK_LIMIT }, (_, k) => `more-${k}`));
  });
});

describe("loadTvPhotos — a guest in the office", () => {
  it("a guest gets nothing, the round or an order — no task is even read", async () => {
    const { tables } = base();
    tables.tv_state = [{ company_id: A, guest: true, guest_until: null }];
    const { client, calls, signed } = fakeBase(tables);
    expect(await loadTvPhotos(client, A, { now: NOW })).toEqual([]);
    expect(await loadTvPhotos(client, A, { taskId: "north", now: NOW })).toEqual([]);
    expect(calls.map((call) => call.table)).toEqual(["tv_state", "tv_state"]);
    expect(signed).toEqual([]);
  });

  it("a visit's guest lasts till `guest_until`, then the photos are back", async () => {
    const { tables } = base();
    tables.tv_state = [{ company_id: A, guest: true, guest_until: new Date(NOW.getTime() + 60_000).toISOString() }];
    expect(await loadTvPhotos(fakeBase(tables).client, A, { now: NOW })).toEqual([]);
    tables.tv_state = [{ company_id: A, guest: true, guest_until: new Date(NOW.getTime() - 60_000).toISOString() }];
    expect((await loadTvPhotos(fakeBase(tables).client, A, { now: NOW })).map((p) => p.id)).toEqual(["n1", "n2"]);
  });

  it("another company's guest does not hide this company's photos", async () => {
    const { tables } = base();
    tables.tv_state = [
      { company_id: A, guest: false, guest_until: null },
      { company_id: B, guest: true, guest_until: null },
    ];
    expect((await loadTvPhotos(fakeBase(tables).client, A, { now: NOW })).map((p) => p.id)).toEqual(["n1", "n2"]);
  });
});

describe("loadTvPhotos — only the company's own folder is signed (principle 6)", () => {
  it("drops a message whose path points into another company's folder, whoever posted it", async () => {
    const { north, tables } = base();
    tables.task_messages.push(photo("n-forged", north, 0.2, { file_path: `${B}/someone/their.jpg` }));
    const { client, signed } = fakeBase(tables);
    const photos = await loadTvPhotos(client, A, { now: NOW });
    expect(photos.map((p) => p.id)).not.toContain("n-forged");
    expect(signed.flatMap((call) => call.paths).every((path) => path.startsWith(`${A}/`))).toBe(true);
  });

  it("the same on an order on the wall", async () => {
    const { north, tables } = base();
    tables.task_messages.push(photo("n-forged", north, 0.2, { file_path: `${B}/x/y.jpg` }));
    const photos = await loadTvPhotos(fakeBase(tables).client, A, { taskId: "north", now: NOW });
    expect(photos.map((p) => p.id)).not.toContain("n-forged");
  });

  it("knows the folder by its whole first segment", () => {
    expect(inCompanyFolder(`${A}/u/f.jpg`, A)).toBe(true);
    expect(inCompanyFolder(`${A}x/u/f.jpg`, A)).toBe(false);
    expect(inCompanyFolder(`${A}/../${B}/f.jpg`, A)).toBe(false);
    expect(inCompanyFolder(`${B}/u/f.jpg`, A)).toBe(false);
  });
});

describe("loadTvPhotos — a person on the wall", () => {
  it("is that person's reports on done tasks, nobody else's", async () => {
    const { north, tables } = base();
    const photos = await loadTvPhotos(fakeBase(tables).client, A, { employeeId: String(north.assignee_id), now: NOW });
    expect(photos.map((p) => p.id)).toEqual(["n1", "n2"]);
    expect(photos.every((p) => p.employee_id === north.assignee_id)).toBe(true);
  });

  it("reaches a month back, past the round's week", async () => {
    const { tables } = base();
    const older = task("older", A, { assignee_id: "north-worker", completed_at: ago(20 * 24) });
    tables.tasks.push(older);
    tables.task_messages.push(photo("old-report", older, 20 * 24));
    const photos = await loadTvPhotos(fakeBase(tables).client, A, { employeeId: "north-worker", now: NOW });
    expect(photos.map((p) => p.id)).toContain("old-report");
  });

  it("another company's person is nothing", async () => {
    const { theirs, tables } = base();
    expect(await loadTvPhotos(fakeBase(tables).client, A, { employeeId: String(theirs.assignee_id), now: NOW })).toEqual([]);
  });
});

describe("loadTvPhotos — the kiosk asks only for what its wall shows (G.5)", () => {
  it("an order's photos only while that order is on the wall", async () => {
    const { tables } = base();
    expect(await loadTvPhotos(fakeBase(tables).client, A, { taskId: "north", role: "tv", now: NOW })).toEqual([]);
    tables.tv_state[0] = { ...tables.tv_state[0], mode: "task", task_id: "north" };
    expect((await loadTvPhotos(fakeBase(tables).client, A, { taskId: "north", role: "tv", now: NOW })).length).toBeGreaterThan(0);
    expect(await loadTvPhotos(fakeBase(tables).client, A, { taskId: "roof", role: "tv", now: NOW })).toEqual([]);
  });

  it("a person's photos only while that person is on the wall", async () => {
    const { tables } = base();
    expect(await loadTvPhotos(fakeBase(tables).client, A, { employeeId: "north-worker", role: "tv", now: NOW })).toEqual([]);
    tables.tv_state[0] = { ...tables.tv_state[0], mode: "employee", employee_id: "north-worker" };
    expect((await loadTvPhotos(fakeBase(tables).client, A, { employeeId: "north-worker", role: "tv", now: NOW })).length).toBeGreaterThan(0);
  });

  it("the director may ask for any order of the company", async () => {
    const { tables } = base();
    expect((await loadTvPhotos(fakeBase(tables).client, A, { taskId: "north", role: "director", now: NOW })).length).toBeGreaterThan(0);
  });
});
