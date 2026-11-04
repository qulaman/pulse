"use client";

import { useEffect, useRef, useState } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { authPost } from "@/components/ops/login/authPost";
import { CodeForm } from "@/components/ops/login/CodeForm";
import { Button } from "@/components/ui/Button";
import { registerFreshPrompt } from "@/lib/ops/client";
import type { VerifyAnswer, VerifyBody } from "@/lib/ops/contract";

/** The dialog alone, so the sandbox can show it without the frame's plumbing. */
export function FreshDialog({ open, onVerify, onCancel }: { open: boolean; onVerify: (code: string) => Promise<void>; onCancel: () => void }) {
  return (
    <Dialog open={open} title="Подтверди кодом" width="sm" onClose={onCancel}>
      <p className="mb-4 text-[14px] leading-5 text-muted">Опасные действия просят свежий код: прошлый старше пяти минут.</p>
      {/* a fresh form per opening: the dialog stays mounted through its way out */}
      {open ? (
        <CodeForm
          onVerify={onVerify}
          extra={
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Отмена
            </Button>
          }
        />
      ) : null}
    </Dialog>
  );
}

function verifyCode(code: string): Promise<VerifyAnswer> {
  return authPost<VerifyAnswer>("/api/ops/auth/verify", { code } satisfies VerifyBody);
}

/**
 * Answers `opsFetch`'s 428 (D-157): the frame mounts it once. Requests that fail together all wait
 * on the same dialog and go again together after the one code.
 */
export function FreshPrompt() {
  const [open, setOpen] = useState(false);
  const waiting = useRef<{ answer: Promise<boolean>; resolve: (ok: boolean) => void } | null>(null);

  useEffect(() => {
    registerFreshPrompt(() => {
      if (!waiting.current) {
        const { promise, resolve } = Promise.withResolvers<boolean>();
        waiting.current = { answer: promise, resolve };
        setOpen(true);
      }
      return waiting.current.answer;
    });
    return () => {
      registerFreshPrompt(null);
      waiting.current?.resolve(false);
      waiting.current = null;
    };
  }, []);

  const finish = (ok: boolean) => {
    waiting.current?.resolve(ok);
    waiting.current = null;
    setOpen(false);
  };

  return (
    <FreshDialog
      open={open}
      onCancel={() => finish(false)}
      onVerify={async (code) => {
        await verifyCode(code);
        finish(true);
      }}
    />
  );
}
