import { describe, expect, it } from "vitest";

import {
  aqtobeDay,
  channelOf,
  currentStep,
  entryLine,
  progressLabel,
  pushAdvice,
  setupProgress,
  setupSteps,
  shouldAutoOpen,
  type SetupFacts,
  type SetupMarks,
} from "./steps";

const IOS_TAB: SetupFacts = {
  platform: "ios",
  maker: "iphone",
  browser: "Safari",
  standalone: false,
  inApp: null,
  installOffer: false,
  push: "unsupported",
  channel: "missing",
  mic: "prompt",
};
const IOS_APP: SetupFacts = { ...IOS_TAB, standalone: true, push: "default" };
const ANDROID: SetupFacts = { ...IOS_TAB, platform: "android", maker: "xiaomi", browser: "Chrome", push: "default", installOffer: true };
const READY: SetupFacts = { ...IOS_APP, push: "granted", channel: "ok", mic: "granted" };

const states = (facts: SetupFacts, marks: SetupMarks = {}) => setupSteps(facts, marks).map((s) => `${s.id}:${s.state}${s.why ? `/${s.why}` : ""}`);

describe("setupSteps (D-190)", () => {
  it("an iPhone tab: the home screen first, push waits for it", () => {
    expect(states(IOS_TAB)).toEqual(["install:todo/ios-tab", "push:blocked/ios-tab", "test:blocked/need-push", "mic:todo"]);
  });

  it("the home-screen app is installed by itself — the sign-in already sent it there", () => {
    expect(states(IOS_APP)).toEqual(["install:done", "push:todo/off", "test:blocked/need-push", "mic:todo"]);
  });

  it("Android: Chrome's dialog when it offers one, the menu otherwise; «установлено» holds in the tab", () => {
    expect(states(ANDROID)[0]).toBe("install:todo/android-offer");
    expect(states({ ...ANDROID, installOffer: false })[0]).toBe("install:todo/android-menu");
    expect(states(ANDROID, { install: "done" })[0]).toBe("install:done");
    // an iPhone tab cannot be talked into «installed»
    expect(states(IOS_TAB, { install: "done" })[0]).toBe("install:todo/ios-tab");
  });

  it("push done only when the browser allows it and the server knows this phone", () => {
    expect(states({ ...IOS_APP, push: "granted", channel: "checking" })[1]).toBe("push:checking");
    expect(states({ ...IOS_APP, push: "granted", channel: "missing" })[1]).toBe("push:todo/resubscribe");
    expect(states({ ...IOS_APP, push: "granted", channel: "broken" })[1]).toBe("push:todo/broken");
    expect(states({ ...IOS_APP, push: "granted", channel: "off" })[1]).toBe("push:todo/device-off");
    expect(states({ ...IOS_APP, push: "denied" })[1]).toBe("push:todo/denied");
    expect(states({ ...IOS_APP, push: "unsupported" })[1]).toBe("push:blocked/unsupported");
    expect(states({ ...IOS_APP, push: "granted", channel: "ok" })[1]).toBe("push:done");
  });

  it("a fact beats a mark: skipped and then switched on is done", () => {
    expect(states(READY, { push: "skipped", mic: "skipped" })).toEqual(["install:done", "push:done", "test:todo", "mic:done"]);
  });

  it("the test asks for working push, then for the person's «пришло»", () => {
    expect(states(READY)[2]).toBe("test:todo");
    expect(states(READY, { test: "done" })[2]).toBe("test:done");
    // permission withdrawn later: the old «пришло» proves nothing now
    expect(states({ ...READY, push: "denied" }, { test: "done" })[2]).toBe("test:blocked/need-push");
  });

  it("the microphone: granted by the browser or checked here", () => {
    expect(states({ ...IOS_APP, mic: "prompt" }, { mic: "done" })[3]).toBe("mic:done");
    expect(states({ ...IOS_APP, mic: "denied" })[3]).toBe("mic:todo/denied");
    expect(states({ ...IOS_APP, mic: "unsupported" })[3]).toBe("mic:blocked/unsupported");
  });
});

describe("progress (D-190)", () => {
  it("«N из 4» counts done steps; skipped ones close the screen but are not done", () => {
    const p = setupProgress(setupSteps(IOS_APP, {}));
    expect(progressLabel(p)).toBe("1 из 4");
    expect(p.complete).toBe(false);
    const skipped = setupProgress(setupSteps(IOS_APP, { push: "skipped", test: "skipped", mic: "skipped" }));
    expect(skipped).toEqual({ done: 1, total: 4, complete: true, checking: false });
    expect(setupProgress(setupSteps(READY, { test: "done" }))).toEqual({ done: 4, total: 4, complete: true, checking: false });
  });

  it("the screen opens on the first step not through", () => {
    expect(currentStep(setupSteps(IOS_TAB, {}))).toBe("install");
    expect(currentStep(setupSteps(IOS_APP, {}))).toBe("push");
    expect(currentStep(setupSteps(READY, {}))).toBe("test");
    expect(currentStep(setupSteps(READY, { test: "done" }))).toBeNull();
  });
});

describe("shouldAutoOpen (D-190)", () => {
  const open = (team: boolean, facts: SetupFacts, marks: SetupMarks = {}) =>
    shouldAutoOpen({ team, facts, marks, progress: setupProgress(setupSteps(facts, marks)) });

  it("the team's first visit on a phone, once", () => {
    expect(open(true, IOS_APP)).toBe(true);
    expect(open(true, IOS_APP, { seen: "2026-11-24T05:00:00Z" })).toBe(false);
  });

  it("never the director, never a computer, never all through, not before the server answered", () => {
    expect(open(false, IOS_APP)).toBe(false);
    expect(open(true, { ...IOS_APP, platform: "other" })).toBe(false);
    expect(open(true, READY, { test: "done" })).toBe(false);
    expect(open(true, { ...IOS_APP, push: "granted", channel: "checking" })).toBe(false);
  });
});

describe("entryLine (D-190)", () => {
  const line = (facts: SetupFacts, marks: SetupMarks = {}) => entryLine(facts, setupSteps(facts, marks));

  it("says the first thing to do, on «вы»", () => {
    expect(line(IOS_TAB)).toBe("Добавьте Pulse на экран «Домой»");
    expect(line(IOS_APP)).toBe("Включите уведомления");
    expect(line({ ...IOS_APP, push: "denied" })).toBe("Уведомления запрещены — разрешите их в настройках");
    expect(line({ ...IOS_APP, push: "granted", channel: "broken" })).toBe("Подключите уведомления заново");
    expect(line(READY)).toBe("Проверьте, что уведомления доходят");
  });

  it("a messenger's browser is asked to open a real one", () => {
    expect(line({ ...ANDROID, inApp: "Telegram" })).toBe("Откройте в Chrome — внутри Telegram уведомлений нет");
  });

  it("nothing once push works and was checked — the microphone and Android's home screen do not nag", () => {
    expect(line(READY, { test: "done" })).toBeNull();
    expect(line({ ...ANDROID, push: "granted", channel: "ok", mic: "prompt" }, { test: "done" })).toBeNull();
    expect(line({ ...IOS_APP, push: "granted", channel: "checking" })).toBeNull();
    expect(line({ ...IOS_APP, platform: "other" })).toBeNull();
  });
});

describe("channelOf (D-190)", () => {
  it("what the server knows of this phone", () => {
    expect(channelOf(null)).toBe("missing");
    expect(channelOf({ enabled: false, last_ok_at: null, last_error_at: null })).toBe("off");
    expect(channelOf({ enabled: true, last_ok_at: null, last_error_at: null })).toBe("ok");
    expect(channelOf({ enabled: true, last_ok_at: "2026-11-24T05:00:00Z", last_error_at: "2026-11-24T06:00:00+00:00" })).toBe("broken");
    expect(channelOf({ enabled: true, last_ok_at: "2026-11-24T07:00:00.123+00:00", last_error_at: "2026-11-24T06:00:00Z" })).toBe("ok");
  });
});

describe("pushAdvice (D-190)", () => {
  it("picks the phone's own places to look, with the browser's name", () => {
    expect(pushAdvice("xiaomi", "Chrome").steps[0]).toContain("«Автозапуск»");
    expect(pushAdvice("samsung", "Samsung Internet").steps[0]).toContain("Samsung Internet");
    expect(pushAdvice("samsung", "Chrome").steps.join(" ")).toContain("Глубоко спящих");
    expect(pushAdvice("iphone", "Safari").steps.join(" ")).toContain("Фокусирование");
    expect(pushAdvice("huawei", "Chrome").steps[0]).toContain("нет сервисов Google");
    expect(pushAdvice("android", "Chrome").steps[0]).toContain("«Без ограничений»");
  });
});

describe("aqtobeDay", () => {
  it("is the day in Aqtobe, not in UTC", () => {
    expect(aqtobeDay(new Date("2026-11-24T20:30:00Z"))).toBe("2026-11-25");
    expect(aqtobeDay(new Date("2026-11-24T18:30:00Z"))).toBe("2026-11-24");
  });
});
