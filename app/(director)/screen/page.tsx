"use client";

import { Remote } from "@/components/screen/Remote";

/**
 * «Экран в кабинете» — пульт стены на телефоне директора (D-76, D-96, D-182). Весь пульт —
 * `components/screen/Remote.tsx`: его же рисует песочница `/dev/screen` на фикстурах.
 */
export default function ScreenPage() {
  return <Remote />;
}
