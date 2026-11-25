import { describe, expect, it } from "vitest";

import { quietHoursText } from "./delivery-window";

describe("quietHoursText", () => {
  it("names the quiet hours, not the delivery window under their title", () => {
    expect(quietHoursText({ from: "08:00", to: "21:00" })).toBe("тихо с 21:00 до 08:00");
    // a window open almost all day leaves a quarter of an hour of quiet — said as it is
    expect(quietHoursText({ from: "00:00", to: "23:45" })).toBe("тихо с 23:45 до 00:00");
  });

  it("says a window that never opens is quiet all day", () => {
    expect(quietHoursText({ from: "21:00", to: "08:00" })).toBe("тихо круглые сутки");
    expect(quietHoursText({ from: "09:00", to: "09:00" })).toBe("тихо круглые сутки");
  });
});
