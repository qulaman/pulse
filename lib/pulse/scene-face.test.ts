import { describe, expect, it } from "vitest";

import { directorMascot, employeeMascot } from "./scene-face";

const director = {
  confirm: null,
  handoff: false,
  oops: false,
  unparsed: false,
  job: null,
  thought: false,
  newsAct: false,
  mood: null,
  idle: false,
  rest: "sleeping",
  awake: "happy",
} as const;

describe("directorMascot", () => {
  it("keeps the card's job over a thought without an act (no «processing» over the clipboard)", () => {
    expect(directorMascot({ ...director, job: "checking", thought: true })).toBe("checking");
  });

  it("keeps the card's job over news with an act of its own", () => {
    expect(directorMascot({ ...director, job: "chatting", thought: true, newsAct: true, mood: "alert" })).toBe("chatting");
  });

  it("reads the news without a card", () => {
    expect(directorMascot({ ...director, thought: true })).toBe("processing");
    expect(directorMascot({ ...director, thought: true, newsAct: true, mood: "alert" })).toBe("alert");
    expect(directorMascot({ ...director, thought: true, newsAct: true })).toBe("calm");
  });

  it("puts the celebration and the phrase in hand over everything", () => {
    expect(directorMascot({ ...director, confirm: "celebrating", job: "checking", thought: true })).toBe("celebrating");
    expect(directorMascot({ ...director, confirm: "sending", handoff: true })).toBe("sending");
  });

  it("plays a failure over the job, keeps «не разобрал» over it", () => {
    expect(directorMascot({ ...director, oops: true, job: "announcing" })).toBe("announcing");
    expect(directorMascot({ ...director, oops: true, mood: "alert" })).toBe("alert");
    expect(directorMascot({ ...director, unparsed: true, job: "checking" })).toBe("thinking");
  });

  it("rests on the waiting screen and is awake on the ring", () => {
    expect(directorMascot({ ...director, idle: true })).toBe("sleeping");
    expect(directorMascot({ ...director })).toBe("happy");
    expect(directorMascot({ ...director, handoff: true, idle: true })).toBe("calm");
  });

  it("back from a long time away reads the news a moment — not over a card, a failure or the news itself", () => {
    expect(directorMascot({ ...director, idle: true, comeback: true })).toBe("processing");
    expect(directorMascot({ ...director, comeback: true, job: "checking" })).toBe("checking");
    expect(directorMascot({ ...director, comeback: true, oops: true, mood: "alert" })).toBe("alert");
    expect(directorMascot({ ...director, comeback: true, thought: true, newsAct: true })).toBe("calm");
  });
});

const employee = {
  cheering: false,
  job: null,
  thought: false,
  idle: false,
  rest: "sleeping",
  awake: "happy",
  loading: false,
  speaking: false,
} as const;

describe("employeeMascot", () => {
  it("keeps the card's job over a thought", () => {
    expect(employeeMascot({ ...employee, job: "checking", thought: true, awake: "calling" })).toBe("checking");
  });

  it("jumps for the medal over the job", () => {
    expect(employeeMascot({ ...employee, cheering: true, job: "checking", thought: true })).toBe("celebrating");
  });

  it("wakes for news without a card, even at rest", () => {
    expect(employeeMascot({ ...employee, thought: true, idle: true, awake: "nervous" })).toBe("nervous");
  });

  it("shows the rest face at rest and the awake one on the ring", () => {
    expect(employeeMascot({ ...employee, idle: true, rest: "calm" })).toBe("calm");
    expect(employeeMascot({ ...employee, loading: true })).toBe("thinking");
    expect(employeeMascot({ ...employee, speaking: true })).toBe("speaking");
    expect(employeeMascot({ ...employee })).toBe("happy");
  });

  it("back from a long time away reads the news a moment, then the news or rest", () => {
    expect(employeeMascot({ ...employee, idle: true, comeback: true })).toBe("processing");
    expect(employeeMascot({ ...employee, comeback: true, thought: true, awake: "calling" })).toBe("calling");
    expect(employeeMascot({ ...employee, comeback: true, job: "checking" })).toBe("checking");
  });
});
