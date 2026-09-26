"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { AnnouncementCard } from "@/components/ether/AnnouncementCard";
import { EtherListBone } from "@/components/ui/PageSkeletons";
import {
  useAcknowledge,
  useDeleteAnnouncement,
  useEther,
  useHeldAnnouncements,
  useSendAnnouncementNow,
  type Announcement,
} from "@/lib/ether/queries";
import { TEAM_ROLES } from "@/lib/routes";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { pluralRu } from "@/lib/tasks/status-text";
import { useMe } from "@/lib/tasks/queries";

const FOLD_KEY = "ether.fold_open";

function useTeamSize() {
  return useQuery({
    queryKey: ["people", "team-size"],
    queryFn: async (): Promise<number> => {
      const supabase = createBrowserSupabase();
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .in("role", [...TEAM_ROLES]);
      return count ?? 0;
    },
  });
}

type Props = {
  /**
   * director — folded under the board on Пульс («Эфир · N объявлений»);
   * employee — on Лента: what still needs «Ознакомился» is open, the rest folded;
   * page — /ether itself: everything open, no fold.
   */
  variant: "director" | "employee" | "page";
};

/**
 * Эфир (D-59): the director's announcements live inside Пульс and Лента instead of a tab
 * of their own. One component, three placements; the fold remembers its state for the session.
 */
export function EtherSection({ variant }: Props) {
  const me = useMe();
  const feed = useEther();
  const team = useTeamSize();
  const ack = useAcknowledge(me.data?.userId);
  const remove = useDeleteAnnouncement();
  const isDirector = me.data?.role === "director";
  // at night an announcement waits for the window; the director may send it now (D-129)
  const held = useHeldAnnouncements(isDirector);
  const sendNow = useSendAnnouncementNow();
  const userId = me.data?.userId;

  const [open, setOpen] = useState<boolean>(() => {
    if (variant === "page") return true;
    try {
      return window.sessionStorage.getItem(FOLD_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.sessionStorage.setItem(FOLD_KEY, next ? "1" : "0");
    } catch {
      // per-session convenience only
    }
  };

  if (feed.isLoading || me.isLoading) return variant === "page" ? <EtherListBone /> : null;

  const items = feed.data ?? [];
  const needsAck = (item: Announcement) => Boolean(userId) && !item.acks.some((a) => a.user_id === userId);
  const pending = variant === "employee" ? items.filter(needsAck) : [];
  const folded = variant === "employee" ? items.filter((item) => !needsAck(item)) : items;

  const card = (item: Announcement) => (
    <AnnouncementCard
      key={item.id}
      item={item}
      userId={userId}
      isDirector={isDirector}
      teamSize={team.data ?? 0}
      onAck={(id) => ack.mutate(id)}
      acking={ack.isPending}
      onDelete={isDirector ? (id) => remove.mutate(id) : undefined}
      heldUntil={isDirector ? held.data?.[item.id] : null}
      onSendNow={isDirector ? (id) => sendNow.mutate(id) : undefined}
    />
  );

  if (variant === "page") {
    return items.length === 0 ? null : <div className="mt-5 flex flex-col gap-3">{items.map(card)}</div>;
  }
  if (items.length === 0) return null;

  return (
    <section aria-label="Эфир" className="mt-5">
      {pending.length > 0 ? <div className="flex flex-col gap-3">{pending.map(card)}</div> : null}
      {folded.length > 0 ? (
        <>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className={`${pending.length > 0 ? "mt-2" : ""} flex min-h-[44px] w-full items-center justify-between px-1 text-left text-[14px] leading-4 text-muted`}
          >
            <span>
              Эфир · {folded.length} {pluralRu(folded.length, ["объявление", "объявления", "объявлений"])}
            </span>
            <span aria-hidden>{open ? "▴" : "▾"}</span>
          </button>
          {open ? (
            <div className="flex flex-col gap-3">
              {folded.map(card)}
              <Link href="/ether" className="min-h-[44px] px-1 text-[14px] leading-[44px] text-muted">
                Открыть Эфир ›
              </Link>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
