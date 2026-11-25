"use client";

import { useState } from "react";

import { useDeskParams } from "@/components/desk/DeskAddress";
import { useDeskScope } from "@/components/desk/DeskScope";
import { SettingsDraftProvider } from "@/components/settings/draft";
import { useNamesKey } from "@/lib/people/names";
import { useMe } from "@/lib/tasks/queries";

import { writeParams } from "../tasks/flow";
import { DirectorErrands } from "./DirectorErrands";
import { SecretaryDraftKeeper } from "./SecretarySettings";
import { isSettingsView, parseSecretaryView } from "./SecretaryTabs";
import { SecretaryErrands } from "./SecretaryErrands";

/**
 * `/desk/errands` — «Секретарь» (D-153, D-197): the secretary's queue or the director's remote,
 * `?view=history|buttons|settings` for the other tabs, `?e=` in the panel, `?from=&to=` over the
 * history. The draft of the secretary's settings lives here, above the tabs: an edit of «Кнопки»
 * survives a look at «Заявки». The settings are read once a settings tab has been opened — the
 * secretary's desk stays open all day and does not need them.
 */
export function ErrandsDesk() {
  // a namesake on screen gets the surname's initial once the roster has come (D-146)
  useNamesKey();
  const { role } = useDeskScope();
  const me = useMe();
  const params = useDeskParams();
  const openId = params.get("e");
  const view = parseSecretaryView(params.get("view"));
  const [editing, setEditing] = useState(isSettingsView(view));
  if (isSettingsView(view) && !editing) setEditing(true);
  // the panel leaves the rest of the address alone: the range and the view stay
  const onOpen = (id: string) => writeParams({ e: id }, { type: "desk-pick" });
  const meId = me.data?.userId ?? "";
  return (
    <SettingsDraftProvider enabled={editing}>
      <SecretaryDraftKeeper view={view} />
      {role === "secretary" ? (
        <SecretaryErrands meId={meId} openId={openId} onOpen={onOpen} view={view} />
      ) : (
        <DirectorErrands meId={meId} openId={openId} onOpen={onOpen} view={view} />
      )}
    </SettingsDraftProvider>
  );
}
