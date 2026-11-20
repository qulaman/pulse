"use client";

import { useEffect, useRef, useState } from "react";

import { CODE_TTL_SECONDS } from "@/lib/login-code/code";
import { useIssueLoginCode, useLoginCodeStatus, type IssuedCode } from "@/lib/people/queries";

/**
 * A login code being handed out (D-135) — the phone's sheet and the desk's card alike: issue one
 * (by itself on open when `autoIssue`), count down its life, see it used. Time left is counted
 * from the moment the answer arrived, not from the server's clock read by this device's clock: a
 * clock minutes off would otherwise burn a live code on screen. `onIssue` runs as a new code is asked.
 */
export function useLoginCode(personId: string, autoIssue: boolean, onIssue?: () => void) {
  const issue = useIssueLoginCode();
  const { mutate } = issue;
  const [issued, setIssued] = useState<{ code: IssuedCode; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const leftMs = issued ? CODE_TTL_SECONDS * 1000 - (now - issued.at) : 0;
  const status = useLoginCodeStatus(personId, true, issued !== null && leftMs > 0);
  // the code on screen is the one that was used: the same expiry, from the server both times
  const landed = issued !== null && status.data?.state === "used" && Date.parse(status.data.expires_at ?? "") === Date.parse(issued.code.expires_at);
  const expired = issued !== null && !landed && leftMs <= 0;

  const started = useRef(onIssue);
  useEffect(() => {
    started.current = onIssue;
  });
  const doIssue = useRef((id: string) => {
    setError(null);
    started.current?.();
    mutate(
      { id, requestId: globalThis.crypto.randomUUID() },
      {
        onSuccess: (code) => {
          setIssued({ code, at: Date.now() });
          setNow(Date.now());
        },
        onError: (e) => setError(e.message),
      },
    );
  });
  const auto = useRef(false);
  useEffect(() => {
    if (!autoIssue || auto.current) return;
    auto.current = true;
    doIssue.current(personId);
  }, [autoIssue, personId]);
  // the countdown ticks only while a live code is on screen
  useEffect(() => {
    if (!issued || landed || expired) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [issued, landed, expired]);

  return { pending: issue.isPending, issued, error, status, leftMs, landed, expired, issueCode: () => doIssue.current(personId) };
}
