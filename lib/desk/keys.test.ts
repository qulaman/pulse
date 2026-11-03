import { describe, expect, it } from "vitest";

import { isCommandKey, isTypingTarget } from "./keys";

const key = (code: string, extra: Partial<{ key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: unknown }> = {}) => ({
  code,
  key: extra.key ?? "",
  ctrlKey: extra.ctrlKey ?? false,
  metaKey: extra.metaKey ?? false,
  altKey: extra.altKey ?? false,
  target: (extra.target ?? null) as EventTarget | null,
});

describe("isTypingTarget", () => {
  it("is true in text fields, text areas, selects and editable blocks", () => {
    expect(isTypingTarget({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(isTypingTarget({ tagName: "INPUT", type: "search" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("is false on buttons, check boxes and the page", () => {
    expect(isTypingTarget({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget({ tagName: "DIV" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("isCommandKey (D-153)", () => {
  it("takes Ctrl+K and Cmd+K in any layout — by the physical key", () => {
    expect(isCommandKey(key("KeyK", { key: "л", ctrlKey: true }))).toBe(true);
    expect(isCommandKey(key("KeyK", { key: "k", metaKey: true }))).toBe(true);
    expect(isCommandKey(key("KeyK", { key: "k" }))).toBe(false);
  });

  it("takes «/» only outside a field", () => {
    expect(isCommandKey(key("Slash", { key: "." }))).toBe(true);
    expect(isCommandKey(key("Digit7", { key: "/" }))).toBe(true);
    expect(isCommandKey(key("Slash", { key: "/", target: { tagName: "INPUT", type: "text" } }))).toBe(false);
  });
});
