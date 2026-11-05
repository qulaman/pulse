"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { findWithoutLogin } from "@/lib/desk/launch-queries";
import { isTeamMember, usePeople } from "@/lib/people/queries";
import { usePushHealth } from "@/lib/push/health-query";

/**
 * «Следующий без входа» on a person's card: the secretary hands out the codes in one sitting,
 * card after card. The walk is asked on a press and stops at the first person without a way in,
 * so an open card costs nothing; everybody having entered is the one long answer, and it is
 * said as such. Whether a person has a way in comes from the routes the card itself reads, a
 * team-wide status would need an RPC (D-153 §14). A person who could not be read is counted, not
 * guessed: «у всех есть вход» is said only when it is known.
 */
export function NextWithoutLogin({ personId }: { personId: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const people = usePeople();
  const health = usePushHealth();
  const [busy, setBusy] = useState(false);

  const team = (people.data ?? []).filter(isTeamMember);
  if (!team.some((person) => person.id !== personId)) return null;

  const go = async () => {
    setBusy(true);
    const { id, unknown } = await findWithoutLogin(client, team, personId, health.data);
    setBusy(false);
    if (id) router.push(`/desk/team/${id}`);
    else toast(unknown > 0 ? "Не смог проверить всех: нет связи" : "Вход есть у всей команды");
  };

  return (
    <Button size="sm" variant="ghost" loading={busy} onClick={() => void go()} data-testid="next-without-login">
      Следующий без входа →
    </Button>
  );
}
