import { describe, expect, it } from "vitest";

import { reworkBannerText, reworkCommentOf, TEXT, unreadWordOf, wordText, type WordMessage } from "./status-text";

const ME = "me";
const BOSS = "boss";

function message(seq: number, sender: string, content: string | null, meta: Record<string, unknown> = {}, type = "text"): WordMessage {
  return { id: `m${seq}`, seq, type, sender_id: sender, content, meta, created_at: `2026-11-12T0${Math.min(seq, 9)}:00:00Z` };
}

describe("rework banner (D-173)", () => {
  it("says the director's own words when the thread has them", () => {
    const thread = [
      message(1, ME, "Смета готова", { report: true }),
      message(2, BOSS, null, { new_status: "rework" }, "status_change"),
      message(3, BOSS, "Нет доставки, добавь", { rework_comment: true }),
    ];
    expect(reworkCommentOf(thread)).toBe("Нет доставки, добавь");
    expect(reworkBannerText(reworkCommentOf(thread))).toBe("Директор вернул: «Нет доставки, добавь»");
  });

  it("takes the newest return when the task came back twice", () => {
    const thread = [message(1, BOSS, "Первый раз", { rework_comment: true }), message(2, BOSS, "Второй раз", { rework_comment: true })];
    expect(reworkCommentOf(thread)).toBe("Второй раз");
  });

  it("falls back to the plain return while the thread is not here", () => {
    expect(reworkCommentOf(undefined)).toBeNull();
    expect(reworkBannerText(null)).toBe(TEXT.reworkReturned);
    expect(reworkBannerText("   ")).toBe(TEXT.reworkReturned);
    // the banner is on the task's own screen: «комментарий внутри» would point at itself
    expect(TEXT.reworkReturned).not.toMatch(/внутри/);
  });
});

describe("the other side's unread word (D-173)", () => {
  const thread = [
    message(1, ME, null, { new_status: "accepted" }, "status_change"),
    message(2, ME, "Принял, сегодня закажу"),
    message(3, BOSS, "Сколько человек будет?"),
  ];

  it("is the newest word above the reader's cursor", () => {
    expect(unreadWordOf(thread, ME, 2)).toEqual({ message: thread[2], unread: true });
  });

  it("is nothing once the cursor has passed it", () => {
    expect(unreadWordOf(thread, ME, 3)).toBeNull();
  });

  it("is nothing when the newest word is the reader's own", () => {
    expect(unreadWordOf([...thread, message(4, ME, "Пятеро")], ME, 3)).toBeNull();
  });

  it("skips status lines: the newest WORD counts", () => {
    expect(unreadWordOf([...thread, message(4, BOSS, null, { new_status: "rework" }, "status_change")], ME, 2)?.message.seq).toBe(3);
  });

  it("leaves the rework comment to the banner", () => {
    expect(unreadWordOf([...thread, message(4, BOSS, "Переделай", { rework_comment: true })], ME, 3)).toBeNull();
  });

  it("without a known cursor shows the word but does not call it new", () => {
    expect(unreadWordOf(thread, ME, null)).toEqual({ message: thread[2], unread: false });
  });

  it("is nothing on an empty or missing thread", () => {
    expect(unreadWordOf(undefined, ME, 0)).toBeNull();
    expect(unreadWordOf([], ME, 0)).toBeNull();
  });
});

describe("a word in one line", () => {
  it("names a voice and a photo", () => {
    expect(wordText(message(1, BOSS, "Позвони мне", {}, "voice"))).toBe("голосовое · Позвони мне");
    expect(wordText(message(1, BOSS, null, {}, "voice"))).toBe("голосовое");
    expect(wordText(message(1, BOSS, "Вот так", {}, "photo"))).toBe("фото · Вот так");
    expect(wordText(message(1, BOSS, "Слова"))).toBe("Слова");
  });
});

describe("words of the task screen (D-173)", () => {
  it("say «переписка», not the jargon «тред»", () => {
    expect(TEXT.askedToast).not.toMatch(/тред/);
  });
});
