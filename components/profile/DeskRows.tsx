"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { DesktopIcon, GearIcon } from "@/components/profile/icons";
import { Row, RowGroup } from "@/components/ui/Row";
import { toast } from "@/components/ui/Toast";
import { goDeskView } from "@/lib/desk/device";

/**
 * «На компьютере» in the phone profile of the director and the secretary (D-153 §11): the desk
 * and its address to type on a computer; the settings, the team, the dictionary and the lab left
 * the phone bar for the desk — they still open here, one row away. «Версия для компьютера» takes
 * off the «Телефонная версия» this browser may hold and goes to the desk.
 */
export function DeskRows() {
  // the address is this site's own, known only in the browser: drawn once mounted, no mismatch
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setOrigin(window.location.origin), 0);
    return () => clearTimeout(timer);
  }, []);
  const address = origin ? `${origin}/desk` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast("Скопировал адрес");
    } catch {
      toast("Не получилось скопировать — адрес можно набрать руками");
    }
  };

  return (
    <>
      <h2 className="eyebrow mt-6 px-1">На компьютере</h2>
      <RowGroup className="mt-2">
        <Row icon={<DesktopIcon />} title="Версия для компьютера" onClick={() => goDeskView("/desk")} />
        <div className="flex min-h-[44px] items-center gap-3 px-4 py-2">
          <span className="nums min-w-0 flex-1 truncate text-[13px] leading-4 text-muted" data-testid="desk-address">
            {address || " "}
          </span>
          <button
            type="button"
            disabled={!address}
            onClick={() => void copy()}
            className="shrink-0 font-display text-[14px] font-semibold leading-[18px] text-accent disabled:opacity-40"
          >
            Скопировать
          </button>
        </div>
        <Link href="/settings" className="flex min-h-[58px] w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-[120ms] ease-out active:bg-surface-2">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}
          >
            <GearIcon />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[16px] leading-[22px]">Настройки, Команда, Словарь, Лаб</span>
            <span className="truncate text-[13px] leading-4 text-muted">на компьютере · открыть здесь</span>
          </span>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="-mr-0.5 shrink-0 text-muted">
            <polyline points="6,3.5 10.5,8 6,12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </RowGroup>
    </>
  );
}
