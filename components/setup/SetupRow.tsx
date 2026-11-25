"use client";

import { useSetup } from "@/components/setup/useSetup";
import { Row } from "@/components/ui/Row";
import { progressLabel } from "@/lib/setup/steps";

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </svg>
  );
}

/**
 * The profile's way into «Подключение» (D-190): «Подключение · 2 из 4» until every step is through,
 * then «Проверить телефон». The same row on the server and in the first frame — the count comes in
 * after the phone has been asked, nothing below moves. A computer has no row: the steps are a
 * phone's.
 */
export function SetupRow() {
  const setup = useSetup();
  if (setup && (setup.facts.platform === "other" || setup.role === "tv")) return null;

  const complete = setup?.progress.complete ?? false;
  const pushOk = setup ? setup.steps.find((s) => s.id === "push")?.state === "done" : true;
  const value = !setup
    ? " "
    : complete
      ? setup.progress.done === setup.progress.total
        ? "всё готово"
        : progressLabel(setup.progress)
      : progressLabel(setup.progress);

  return (
    <Row
      icon={<PhoneIcon />}
      title={complete ? "Проверить телефон" : "Подключение"}
      value={value}
      valueColor={!setup ? undefined : complete ? "var(--ok)" : pushOk ? undefined : "var(--warn)"}
      href="/setup?from=profile"
    />
  );
}
