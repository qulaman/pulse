"use client";

import { useState } from "react";

import { LoginCodePanel } from "@/components/people/LoginCodePanel";
import { DevicesIcon } from "@/components/settings/icons";
import { Row } from "@/components/ui/Row";
import { Sheet } from "@/components/ui/Sheet";

/**
 * «Войти на другом устройстве» (D-135): a one-time code for one's own second device — the
 * director's tablet, the secretary's computer — without anybody else and without a password.
 * Signing in on the new device does not sign this one out.
 */
export function OtherDeviceRow({ userId, fullName }: { userId: string; fullName: string }) {
  const [open, setOpen] = useState(false);
  // a fresh panel (and a fresh code) per opening; the closing sheet keeps the last one on screen
  const [key, setKey] = useState(0);
  const close = () => setOpen(false);

  return (
    <>
      <Row
        icon={<DevicesIcon />}
        title="Войти на другом устройстве"
        value="код"
        onClick={() => {
          setKey((k) => k + 1);
          setOpen(true);
        }}
      />
      <Sheet open={open} onClose={close} title="Вход на другом устройстве">
        <LoginCodePanel key={key} person={{ id: userId, full_name: fullName }} self autoIssue onDone={close} />
      </Sheet>
    </>
  );
}
