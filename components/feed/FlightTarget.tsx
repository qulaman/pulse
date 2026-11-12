"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type FlightTarget = {
  /** Where a card taken in hand flies: the face, when it is on the screen. */
  getTarget: () => HTMLElement | null;
  /** The copy has reached the target — for the face to answer it. */
  onLand?: () => void;
};

const FlightContext = createContext<FlightTarget | null>(null);

/**
 * The screen whose cards fly (D-167): inside it «Принял» sends a copy of the card into the
 * face's hands and a report handed in sends one up to the director. Outside it — «Мои дела»,
 * the task's own screen — the cards stay still. The value never changes, so a parent passing a
 * new arrow every render re-renders nobody; the latest callbacks are read when a card flies.
 */
export function FlightTargetProvider({ getTarget, onLand, children }: FlightTarget & { children: ReactNode }) {
  const latest = useRef<FlightTarget>({ getTarget, onLand });
  useLayoutEffect(() => {
    latest.current = { getTarget, onLand };
  });
  const [value] = useState<FlightTarget>(() => ({
    getTarget: () => latest.current.getTarget(),
    onLand: () => latest.current.onLand?.(),
  }));
  return <FlightContext value={value}>{children}</FlightContext>;
}

/** The flight target of the screen, or null where cards do not fly. */
export function useFlightTarget(): FlightTarget | null {
  return useContext(FlightContext);
}
