import type { QueryClient } from "@tanstack/react-query";

import { markSent } from "@/components/screen/sent";

/**
 * The remote's states on a made-up company (D-182), for `/dev/screen` (the phone) and
 * `/dev/screen/desk` (the desk's «Экран»): one wall row per case, the same people, boards, a meeting
 * on right now and an order waiting for acceptance, a stopped clock — so two pictures compare.
 */

export const SCREEN_CASES = [
  "ether",
  "person",
  "silent15",
  "silent",
  "sound",
  "morning",
  "manual",
  "visitor",
  "message",
  "never",
  "night",
] as const;
export type ScreenCase = (typeof SCREEN_CASES)[number];

/** Wednesday 18 Nov 2026, 14:20 in Aqtobe — the day's round. */
const DAY = "2026-11-18T09:20:00Z";
const AT: Partial<Record<ScreenCase, string>> = {
  morning: "2026-11-18T03:40:00Z", // 08:40 — the program's morning
  night: "2026-11-18T17:30:00Z", // 22:30 — the wall asleep
};

/** Which `/dev/tv` case the live wall in the sheet shows for a remote case. */
export const WALL_CASE: Record<ScreenCase, string> = {
  ether: "face",
  person: "focus",
  silent15: "face",
  silent: "face",
  sound: "face",
  morning: "calendar",
  manual: "clock",
  visitor: "visit",
  message: "message",
  never: "face",
  night: "night",
};

export function frozenNowOf(name: ScreenCase): string {
  return AT[name] ?? DAY;
}

const iso = (base: string, minutes: number) => new Date(new Date(base).getTime() + minutes * 60_000).toISOString();

const PEOPLE = [
  ["p1", "Марат Ахметов", "Прораб"],
  ["p2", "Айгерим Сапарова", "Бухгалтер"],
  ["p3", "Ерлан Беков", "Снабженец"],
  ["p4", "Динара Касымова", "Секретарь"],
  ["p5", "Тимур Жаксылыков", "Водитель"],
  ["p6", "Асель Муратова", "Юрист"],
  ["p7", "Нурлан Серикбаев", "Инженер"],
  ["p8", "Сауле Ибраева", "Менеджер"],
] as const;

export function seedScreen(client: QueryClient, name: ScreenCase): void {
  const now = frozenNowOf(name);
  // nothing here may reach the database: the seeded rows stay as they are
  client.setDefaultOptions({ queries: { staleTime: Infinity, refetchOnMount: false, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false } });
  client.setQueryData(["me"], { userId: "d1", companyId: "c1", role: "director", isActive: true, fullName: "Директор" });
  client.setQueryData(["company", "points_enabled"], true);
  client.setQueryData(
    ["people"],
    [
      ...PEOPLE.map(([id, full_name, position]) => ({ id, full_name, position, role: "employee", is_active: true, avatar_url: null, aliases: [], company_id: "c1" })),
      { id: "tv1", full_name: "Экран в кабинете", position: null, role: "tv", is_active: true, avatar_url: null, aliases: [], company_id: "c1" },
    ],
  );
  client.setQueryData(["mind_boards", "mine", "d1"], [
    { id: "b1", title: "Планёрка · понедельник", user_id: "d1", archived_at: null, deleted_at: null, finished_at: null, pinned_at: null, updated_at: iso(now, -60), created_at: iso(now, -600) },
  ]);
  client.setQueryData(["notes", "mine", "d1"], []);
  // the director's meeting on right now: Марат and Ерлан are in the office; Айгерим's order waits for acceptance
  client.setQueryData(["calendar", "list"], [
    {
      id: "ev1",
      title: "Смета по складу",
      starts_at: iso(now, -10),
      ends_at: iso(now, 30),
      author_id: "d1",
      cancelled_at: null,
      location: "Кабинет",
      participants: [
        { event_id: "ev1", user_id: "p1", status: "accepted", person: { full_name: "Марат Ахметов" } },
        { event_id: "ev1", user_id: "p3", status: "invited", person: { full_name: "Ерлан Беков" } },
      ],
    },
  ]);
  client.setQueryData(["tasks", "sent", "d1"], [
    { id: "t1", title: "Акт сверки с поставщиком", status: "pending_review", assignee_id: "p2", author_id: "d1", deadline: null, created_at: iso(now, -120), assignee: { full_name: "Айгерим Сапарова" }, author: { full_name: "Директор" } },
  ]);
  client.setQueryData(["tv", "summary", false], {
    guest: false,
    points_enabled: true,
    now,
    pulse: [],
    counts: { overdue: 0, declined: 0, review: 0, questions: 0 },
    today: { sent: 0, done: 0, in_work: 0 },
    rating: [],
    load: [],
    week: [],
    merch: [],
    events: [],
    program: { night_from: "21:00", night_to: "08:00", evening_from: "17:00" },
    announcement: null,
  });

  const visits =
    name === "visitor"
      ? [{ id: "v1", kind: "visitor", status: "waiting", note: "Иванов, по поставкам бетона", created_at: iso(now, -5), answered_at: null, shown_at: iso(now, -5), closed_at: null }]
      : name === "message"
        ? [{ id: "m1", kind: "message", status: "waiting", note: "Звонил Ахметов из банка, перезвоните до 16:00", created_at: iso(now, -3), answered_at: null, shown_at: iso(now, -3), closed_at: null }]
        : [];
  client.setQueryData(["visits", "list"], visits);

  const row = {
    company_id: "c1",
    mode: "ether",
    employee_id: null as string | null,
    task_id: null,
    scene: "face",
    guest: false,
    guest_until: null,
    clock_style: "digital",
    calendar_view: "week",
    rating_view: "week",
    carousel: true,
    board_id: null,
    board_until: null,
    board_guest: false,
    board_point: null,
    board_view: "list",
    week_board_id: null,
    week_board_until: null,
    awake_until: null,
    expires_at: null as string | null,
    version: 5,
    reload_requested_at: null,
    seen_at: iso(now, -0.3) as string | null,
    applied_version: 5,
    updated_by: "d1",
    updated_at: now,
    scene_set_at: iso(now, -300) as string | null,
    scale: 100,
    health: { build: "dev", up_min: 300, sound: "running", silent_rings: 0, wake: "on" } as Record<string, unknown> | null,
  };
  if (name === "person") Object.assign(row, { mode: "employee", employee_id: "p1", expires_at: iso(now, 7) });
  if (name === "silent15") {
    Object.assign(row, { version: 6, applied_version: 5 });
    markSent(6, new Date(now).getTime() - 20_000);
  }
  if (name === "silent") Object.assign(row, { seen_at: iso(now, -66) });
  if (name === "sound") Object.assign(row, { health: { build: "dev", up_min: 300, sound: "suspended", silent_rings: 1, wake: "on" } });
  if (name === "manual") Object.assign(row, { carousel: false, scene: "clock", scene_set_at: iso(now, -50) });
  if (name === "never") Object.assign(row, { seen_at: null, applied_version: null, health: null });
  client.setQueryData(["tv", "state"], row);
}

/**
 * Cut the sandbox off the network before the remote mounts: a request to Supabase or `/api` fails
 * at once, so no fetch, no realtime resync and no key pressed here reaches the shared database.
 */
export function cutNetwork(): void {
  const w = window as unknown as { __screenCut?: boolean };
  if (w.__screenCut) return;
  w.__screenCut = true;
  const real = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (/supabase\.co|\/rest\/v1\/|\/auth\/v1\/|\/realtime\/|\/api\//.test(url)) return Promise.reject(new TypeError("sandbox: no network"));
    return real(input, init);
  };
}
