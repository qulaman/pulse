import { describe, expect, it } from "vitest";

import { mergeTvRow, type TvState } from "./queries";

const AT = "2026-11-18T09:00:00.000Z";
const LATER = "2026-11-18T09:01:00.000Z";

function row(patch: Partial<TvState> = {}): TvState {
  return {
    company_id: "c1",
    mode: "ether",
    employee_id: null,
    task_id: null,
    scene: "face",
    scene_set_at: null,
    scale: 100,
    health: null,
    guest: false,
    guest_until: null,
    clock_style: "digital",
    calendar_view: "week",
    rating_view: "week",
    carousel: false,
    board_id: null,
    board_until: null,
    board_guest: false,
    board_point: null,
    board_view: "list",
    week_board_id: null,
    week_board_until: null,
    awake_until: null,
    expires_at: null,
    version: 5,
    reload_requested_at: null,
    seen_at: AT,
    applied_version: 5,
    updated_by: null,
    updated_at: AT,
    ...patch,
  };
}

describe("mergeTvRow — строка стены из сокета (D-182)", () => {
  it("новая версия — новая строка", () => {
    const next = row({ version: 6, scene: "clock", scale: 115 });
    expect(mergeTvRow(row(), next)).toEqual(next);
  });

  it("ключ, которого сокет не прислал, остаётся прежним", () => {
    const rest: Partial<TvState> = row({ version: 6, scene: "clock" });
    delete rest.health;
    expect(mergeTvRow(row({ health: { build: "v5" } }), rest)).toMatchObject({ version: 6, scene: "clock", health: { build: "v5" } });
  });

  it("квитанция киоска той же версии двигает только квитанцию — команда пульта в кэше не откатывается", () => {
    // the remote has just patched its command in: same version, the scene already moved
    const patched = row({ scene: "calendar", carousel: false });
    const echo = row({ seen_at: LATER, applied_version: 5, health: { build: "v5" } });
    expect(mergeTvRow(patched, echo)).toEqual({ ...patched, seen_at: LATER, health: { build: "v5" } });
  });

  it("запоздавшее эхо старой версии не возвращает старую сцену", () => {
    const current = row({ version: 7, scene: "rating" });
    const late = row({ version: 6, scene: "face", seen_at: LATER, applied_version: 6 });
    expect(mergeTvRow(current, late)).toEqual({ ...current, seen_at: LATER, applied_version: 6 });
  });

  it("квитанция старше той, что в кэше, ничего не меняет", () => {
    const current = row({ seen_at: LATER, applied_version: 5 });
    expect(mergeTvRow(current, row({ seen_at: AT, applied_version: 4 }))).toBe(current);
  });

  it("первая строка — какая пришла; без версии — не строка", () => {
    expect(mergeTvRow(null, row())).toEqual(row());
    expect(mergeTvRow(undefined, { seen_at: AT })).toBeUndefined();
    expect(mergeTvRow(null, { seen_at: AT })).toBeNull();
  });

  it("строки нет — кэш пуст", () => {
    expect(mergeTvRow(row(), null)).toBeNull();
  });

  it("строка чужой компании не ложится на свою", () => {
    const own = row();
    expect(mergeTvRow(own, row({ company_id: "c2", version: 99 }))).toBe(own);
  });
});
