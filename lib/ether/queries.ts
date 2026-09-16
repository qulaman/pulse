"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { useRealtimeInvalidate, useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type AnnouncementRow = Database["public"]["Tables"]["announcements"]["Row"];

export type Announcement = AnnouncementRow & {
  author: { full_name: string } | null;
  acks: { user_id: string; created_at: string; user: { full_name: string } | null }[];
};

export const etherKeys = { feed: ["ether", "feed"] as const };

const SELECT =
  "*, author:profiles!announcements_author_id_fkey(full_name), acks:announcement_acks(user_id, created_at, user:profiles!announcement_acks_user_id_fkey(full_name))";

async function fetchFeed(): Promise<Announcement[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("announcements")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Announcement[];
}

/** Эфир: announcements newest first, acks embedded; both tables feed the same query. */
export function useEther() {
  const query = useRealtimeQuery<Announcement[]>({
    queryKey: etherKeys.feed,
    queryFn: fetchFeed,
    channel: { table: "announcements" },
  });
  // an ack is a row of another table — invalidate the feed when one lands
  useRealtimeInvalidate({ table: "announcement_acks" }, etherKeys.feed);
  return query;
}

export function useAcknowledge(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (announcementId: string) => {
      if (!userId) throw new Error("no user");
      const supabase = createBrowserSupabase();
      const { error } = await supabase
        .from("announcement_acks")
        .insert({ announcement_id: announcementId, user_id: userId });
      // a second tap is not an error: the ack is already there
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    },
    onMutate: async (announcementId) => {
      await queryClient.cancelQueries({ queryKey: etherKeys.feed });
      const previous = queryClient.getQueryData<Announcement[]>(etherKeys.feed);
      if (previous && userId) {
        queryClient.setQueryData<Announcement[]>(
          etherKeys.feed,
          previous.map((a) =>
            a.id === announcementId && !a.acks.some((ack) => ack.user_id === userId)
              ? { ...a, acks: [...a.acks, { user_id: userId, created_at: new Date().toISOString(), user: null }] }
              : a,
          ),
        );
      }
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(etherKeys.feed, context.previous);
      toast("Не получилось отметить. Попробуй ещё раз");
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: etherKeys.feed }),
  });
}

/** «Удалить» an announcement: the director takes it back for good, acks go with it (RLS: director only). */
export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (announcementId: string) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.from("announcements").delete().eq("id", announcementId);
      if (error) throw new Error(error.message);
    },
    onMutate: async (announcementId) => {
      await queryClient.cancelQueries({ queryKey: etherKeys.feed });
      const previous = queryClient.getQueryData<Announcement[]>(etherKeys.feed);
      if (previous) queryClient.setQueryData<Announcement[]>(etherKeys.feed, previous.filter((a) => a.id !== announcementId));
      return { previous };
    },
    onSuccess: () => toast("Удалил объявление"),
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(etherKeys.feed, context.previous);
      toast("Не получилось удалить. Попробуй ещё раз");
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: etherKeys.feed }),
  });
}
