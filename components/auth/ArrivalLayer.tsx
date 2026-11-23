"use client";

import { create } from "zustand";

import { Arrival, type ArrivalBrand } from "./Arrival";

type Pass = { from: { name: string }; to: ArrivalBrand };

/**
 * The pass «из продукта — в свою компанию» lives above every screen (D-135): the sign-in hands it
 * over and navigates at once, so the home screen loads under it instead of after it (principle 1a).
 */
const useArrival = create<{ pass: Pass | null; done: () => void }>((set) => ({
  pass: null,
  done: () => set({ pass: null }),
}));

export function playArrival(pass: Pass) {
  useArrival.setState({ pass });
}

export function ArrivalLayer() {
  const pass = useArrival((state) => state.pass);
  const done = useArrival((state) => state.done);
  return pass ? <Arrival from={pass.from} to={pass.to} onDone={done} /> : null;
}
