"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { describeCalendar } from "@/lib/calendar/say";
import type { CalendarEvent } from "@/lib/calendar/queries";
import type { Errand } from "@/lib/errands/queries";
import { describeErrandsForDirector } from "@/lib/errands/say";
import { describeChanges, openingLine, type BoardTask, type Lanes, type Phrase } from "@/lib/pulse/board";
import { describeEther, type EtherPost } from "@/lib/pulse/ether";

/** How long the mascot's mouth moves after a new line. */
const SPEAKING_MS = 1_200;

export type SpokenLine = Phrase & { id: string; /** the greeting and verdict, as opposed to a change on the board */ opening: boolean };

let counter = 0;
const nextId = () => `say:${++counter}`;

/**
 * What the assistant says right now — one line. On the first data it greets and gives
 * the verdict; afterwards every change of the board (Realtime, or the director's own
 * tap) replaces the line with what happened. A tap on the face repeats the opening.
 * No queue, no typing: the board carries the state, the line carries the moment.
 */
export type Voice = {
  opening: (lanes: Lanes, now: Date, name: string) => Phrase;
  describe: (prev: readonly BoardTask[], next: readonly BoardTask[], now: Date) => Phrase[];
  /** Эфир is a second source of news, on its own table and its own diff. */
  describeEther?: (prev: readonly EtherPost[], next: readonly EtherPost[]) => Phrase[];
  /** The calendar is the third: an invitation, an answer, a move, and the reminder tick. */
  describeCalendar?: (prev: readonly CalendarEvent[], next: readonly CalendarEvent[], now: Date) => Phrase[];
  /** Errands are a third: «Айгуль · кофе принят» (D-79). */
  describeErrands?: (prev: readonly Errand[], next: readonly Errand[], now: Date) => Phrase[];
};

/** The director's voice: the verdict on opening, the board's changes as facts. */
export function useSpeech(
  rows: BoardTask[] | undefined,
  lanes: Lanes,
  now: Date,
  directorName: string,
  meId: string,
  ether?: EtherPost[],
  calendar?: CalendarEvent[],
  errands?: Errand[],
) {
  // «Марат пишет по …» is a message the reader has not seen — the reader is the director
  const voice = useMemo<Voice>(
    () => ({
      opening: openingLine,
      describe: (prev, next, at) => describeChanges(prev, next, at, meId),
      describeEther: (prev, next) => describeEther(prev, next, meId),
      describeCalendar: (prev, next, at) => describeCalendar(prev, next, at, meId),
      describeErrands: (prev, next) => describeErrandsForDirector(prev, next),
    }),
    [meId],
  );
  return useSpeechWith(rows, lanes, now, directorName, voice, ether, calendar, errands);
}

export function useSpeechWith(
  rows: BoardTask[] | undefined,
  lanes: Lanes,
  now: Date,
  directorName: string,
  voice: Voice,
  ether?: EtherPost[],
  calendar?: CalendarEvent[],
  errands?: Errand[],
) {
  const [line, setLine] = useState<SpokenLine | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const previous = useRef<BoardTask[] | undefined>(undefined);
  // the opening greets by name; if the name lands after the board did, the greeting is redone quietly
  const opening = useRef<{ name: string } | null>(null);
  // the clock and the lanes as of the latest render, for the effects and the replay tap
  // (declared before the effects below, so they see the fresh values)
  const nowRef = useRef(now);
  const lanesRef = useRef(lanes);
  useEffect(() => {
    nowRef.current = now;
    lanesRef.current = lanes;
  }, [now, lanes]);

  const say = useCallback((phrase: Phrase, isOpening = false) => {
    setLine({ ...phrase, id: nextId(), opening: isOpening });
    setSpeaking(true);
  }, []);

  useEffect(() => {
    if (!rows) return;
    const before = previous.current;
    previous.current = rows;
    if (!before) {
      opening.current = { name: directorName };
      say(voice.opening(lanesRef.current, nowRef.current, directorName), true);
      return;
    }
    const phrases = voice.describe(before, rows, nowRef.current);
    if (phrases.length > 0) {
      opening.current = null;
      say(phrases[phrases.length - 1]!);
    }
  }, [rows, directorName, say, voice]);

  // Эфир: the first feed is the baseline, every later change is a word of its own
  const etherBefore = useRef<EtherPost[] | undefined>(undefined);
  useEffect(() => {
    if (!ether || !voice.describeEther) return;
    const before = etherBefore.current;
    etherBefore.current = ether;
    if (!before) return;
    const phrases = voice.describeEther(before, ether);
    if (phrases.length > 0) {
      opening.current = null;
      say(phrases[phrases.length - 1]!);
    }
  }, [ether, say, voice]);

  // The calendar: same shape again — the first feed is the baseline, a change is a word
  const calendarBefore = useRef<CalendarEvent[] | undefined>(undefined);
  useEffect(() => {
    if (!calendar || !voice.describeCalendar) return;
    const before = calendarBefore.current;
    calendarBefore.current = calendar;
    if (!before) return;
    const phrases = voice.describeCalendar(before, calendar, nowRef.current);
    if (phrases.length > 0) {
      opening.current = null;
      say(phrases[phrases.length - 1]!);
    }
  }, [calendar, say, voice]);

  // Errands: the same shape as the calendar — the first feed is the baseline
  const errandsBefore = useRef<Errand[] | undefined>(undefined);
  useEffect(() => {
    if (!errands || !voice.describeErrands) return;
    const before = errandsBefore.current;
    errandsBefore.current = errands;
    if (!before) return;
    const phrases = voice.describeErrands(before, errands, nowRef.current);
    if (phrases.length > 0) {
      opening.current = null;
      say(phrases[phrases.length - 1]!);
    }
  }, [errands, say, voice]);

  useEffect(() => {
    if (!opening.current || opening.current.name === directorName) return;
    opening.current = { name: directorName };
    setLine((current) => (current ? { ...voice.opening(lanesRef.current, nowRef.current, directorName), id: current.id, opening: true } : current));
  }, [directorName, voice]);

  useEffect(() => {
    if (!speaking) return;
    const timer = setTimeout(() => setSpeaking(false), SPEAKING_MS);
    return () => clearTimeout(timer);
  }, [speaking, line?.id]);

  const replay = useCallback(() => {
    opening.current = { name: directorName };
    say(voice.opening(lanesRef.current, nowRef.current, directorName), true);
  }, [say, directorName, voice]);

  return { line, speaking, replay };
}
