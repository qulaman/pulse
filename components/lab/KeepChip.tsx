"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Chip } from "@/components/ui/Chip";
import { toast } from "@/components/ui/Toast";
import { createBrowserSupabase } from "@/lib/supabase/client";

/** A recognition's recording (by its client_request_id) and whether it is kept «в корпус». */
export type Recording = { path: string; kept: boolean };
export type Recordings = Map<string, Recording>;

const keyOf = (crids: readonly string[]) => ["lab", "voice-kept", crids] as const;

/**
 * The recordings behind the lab's rows (D-155 §3), read by `/api/lab/recordings` on the server.
 */
export function useRecordings(crids: readonly string[], enabled: boolean) {
  return useQuery({
    queryKey: keyOf(crids),
    enabled: enabled && crids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Recordings | null> => {
      const res = await fetch("/api/lab/recordings", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ crids }),
      });
      if (!res.ok) throw new Error(`recordings read failed: ${res.status}`);
      const { recordings } = (await res.json()) as { recordings: Array<{ crid: string } & Recording> | null };
      if (!recordings) return null;
      return new Map(recordings.map(({ crid, path, kept }) => [crid, { path, kept }]));
    },
  });
}

/**
 * «В корпус» on a lab row — the director's: a kept recording is never purged, so the STT
 * corpus can be checked against it later. The state is absolute (voice_keep), so a repeat
 * of the same tap is harmless.
 */
export function KeepChip({ crids, crid, recording }: { crids: readonly string[]; crid: string; recording: Recording }) {
  const queryClient = useQueryClient();
  const key = keyOf(crids);
  const keep = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await createBrowserSupabase().rpc("voice_keep", { p_path: recording.path, p_keep: next });
      if (error) throw new Error(error.message);
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Recordings | null>(key);
      if (previous) queryClient.setQueryData<Recordings>(key, new Map(previous).set(crid, { ...recording, kept: next }));
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(key, context.previous);
      toast("Не получилось отметить. Попробуй ещё раз");
    },
  });

  return (
    <Chip
      tone={recording.kept ? "accent" : "neutral"}
      aria-pressed={recording.kept}
      disabled={keep.isPending}
      onClick={() => keep.mutate(!recording.kept)}
      data-testid="lab-keep"
    >
      В корпус
    </Chip>
  );
}
