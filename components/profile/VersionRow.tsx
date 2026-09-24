"use client";

import { useState, useSyncExternalStore } from "react";

import { useSendQueue } from "@/components/OfflineBanner";
import { Row } from "@/components/ui/Row";
import { UpdateIcon } from "@/components/profile/icons";
import { toast } from "@/components/ui/Toast";
import { useUpdateRequest } from "@/lib/update/client";
import { useServerVersion } from "@/lib/update/queries";
import { BUILD, versionStatus } from "@/lib/version";

const noSubscribe = () => () => {};

/**
 * Profile row «Версия» (D-115): whether this phone runs the server's build. «актуальная» in
 * green, «обновить» in the accent — one tap updates; otherwise a tap asks the server again.
 * The date of the version itself is in the footer under the list.
 */
export function VersionRow() {
  const server = useServerVersion();
  const { isOnline } = useSendQueue();
  const request = useUpdateRequest((state) => state.request);
  const [checking, setChecking] = useState(false);
  // the page streams in after the layout: by the time this row hydrates the layout may
  // already hold the answer, while the server drew «проверяю…» — hydrate as the server did
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const status = hydrated && isOnline ? versionStatus(BUILD, server.data) : "unknown";
  const due = status === "outdated" || status === "required";

  // no `isFetching` here: the server renders the row before the first ask, the browser
  // already mid-ask — the first frame has to read the same on both
  const value =
    status === "current"
      ? "актуальная"
      : due
        ? "обновить"
        : !isOnline
          ? "нет связи"
          : hydrated && server.isError
            ? "проверить"
            : "проверяю…";

  const check = async () => {
    setChecking(true);
    const result = await server.refetch();
    setChecking(false);
    if (result.error || !result.data) toast("Не получилось проверить. Попробую позже");
    else if (versionStatus(BUILD, result.data) === "current") toast("Это последняя версия");
  };

  return (
    <Row
      icon={<UpdateIcon />}
      title="Версия"
      value={value}
      valueColor={status === "current" ? "var(--ok)" : due ? "var(--accent)" : undefined}
      busy={checking}
      disabled={!isOnline}
      onClick={due ? request : () => void check()}
    />
  );
}
