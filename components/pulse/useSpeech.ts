"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { describeChanges, openingLine, type BoardTask, type Lanes, type Phrase } from "@/lib/pulse/board";

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
export function useSpeech(rows: BoardTask[] | undefined, lanes: Lanes, now: Date, directorName: string) {
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
      say(openingLine(lanesRef.current, nowRef.current, directorName), true);
      return;
    }
    const phrases = describeChanges(before, rows, nowRef.current);
    if (phrases.length > 0) {
      opening.current = null;
      say(phrases[phrases.length - 1]!);
    }
  }, [rows, directorName, say]);

  useEffect(() => {
    if (!opening.current || opening.current.name === directorName) return;
    opening.current = { name: directorName };
    setLine((current) => (current ? { ...openingLine(lanesRef.current, nowRef.current, directorName), id: current.id, opening: true } : current));
  }, [directorName]);

  useEffect(() => {
    if (!speaking) return;
    const timer = setTimeout(() => setSpeaking(false), SPEAKING_MS);
    return () => clearTimeout(timer);
  }, [speaking, line?.id]);

  const replay = useCallback(() => {
    opening.current = { name: directorName };
    say(openingLine(lanesRef.current, nowRef.current, directorName), true);
  }, [say, directorName]);

  return { line, speaking, replay };
}
