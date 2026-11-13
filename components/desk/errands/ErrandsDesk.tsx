"use client";

import { useSearchParams } from "next/navigation";

import { useDeskScope } from "@/components/desk/DeskScope";
import { useNamesKey } from "@/lib/people/names";
import { useMe } from "@/lib/tasks/queries";

import { writeParams } from "../tasks/flow";
import { DirectorErrands } from "./DirectorErrands";
import { SecretaryErrands } from "./SecretaryErrands";

/** `/desk/errands` (D-153): the secretary's queue or the director's view, `?e=` in the panel, `?from=&to=` over the history. */
export function ErrandsDesk() {
  // a namesake on screen gets the surname's initial once the roster has come (D-146)
  useNamesKey();
  const { role } = useDeskScope();
  const me = useMe();
  const params = useSearchParams();
  const openId = params.get("e");
  // the panel leaves the rest of the address alone: the range and the view stay
  const onOpen = (id: string) => writeParams({ e: id });
  const meId = me.data?.userId ?? "";
  return role === "secretary" ? (
    <SecretaryErrands meId={meId} openId={openId} onOpen={onOpen} history={params.get("view") === "history"} />
  ) : (
    <DirectorErrands meId={meId} openId={openId} onOpen={onOpen} />
  );
}
