"use client";

import { useRef, useState, type FormEvent } from "react";

import { Row, RowGroup } from "@/components/ui/Row";
import { ExitIcon } from "@/components/profile/icons";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { dropMedia, listMedia } from "@/lib/media/pending";
import { forgetThisDevice } from "@/lib/push/client";
import { pluralRu } from "@/lib/tasks/status-text";
import { dropPhrase, listPhrases } from "@/lib/voice/kept";

/** «2 записи и 1 файл из переписки» — what the phone still holds for this person (D-130). */
function waitingWords(phrases: number, files: number): string {
  const parts = [
    ...(phrases > 0 ? [`${phrases} ${pluralRu(phrases, ["запись", "записи", "записей"])}`] : []),
    ...(files > 0 ? [`${files} ${pluralRu(files, ["файл", "файла", "файлов"])} из переписки`] : []),
  ];
  return parts.join(" и ");
}

/**
 * Signing out is one tap away from the tab bar, so it asks first: on a shared phone a
 * stray tap would cost the person their password. The action itself is the server
 * action from the page — the sheet only confirms it.
 */
export function SignOutRow({ action, userId, className = "" }: { action: () => Promise<void>; userId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const forgotten = useRef(false);
  // what the phone still holds for this person — recordings, files of threads (D-130)
  const [waiting, setWaiting] = useState<{ phrases: number; files: number }>({ phrases: 0, files: 0 });
  const erase = useRef(false);
  const form = useRef<HTMLFormElement>(null);

  const openSheet = () => {
    setOpen(true);
    void Promise.all([listPhrases(userId), listMedia(userId)]).then(([phrases, files]) =>
      setWaiting({ phrases: phrases.length, files: files.length }),
    );
  };

  // this phone stops getting the person's pushes before the session is gone (D-114): the
  // sign-out waits for it at most 1.5 s — no network must not keep anybody signed in
  const submit = (event: FormEvent<HTMLFormElement>) => {
    setPending(true);
    if (forgotten.current) return;
    event.preventDefault();
    const target = event.currentTarget;
    // «Стереть и выйти»: a shared phone keeps nothing of this person (D-130 §9)
    const wipe = erase.current
      ? Promise.all([listPhrases(userId), listMedia(userId)]).then(([phrases, files]) =>
          Promise.all([...phrases.map((p) => dropPhrase(p.id)), ...files.map((f) => dropMedia(f.id))]),
        )
      : Promise.resolve();
    void wipe
      .then(() => Promise.race([forgetThisDevice(), new Promise((resolve) => setTimeout(resolve, 1500))]))
      .then(() => {
        forgotten.current = true;
        target.requestSubmit();
      });
  };

  const held = waitingWords(waiting.phrases, waiting.files);

  return (
    <>
      <RowGroup className={className}>
        <Row icon={<ExitIcon />} title="Выйти" tone="danger" onClick={openSheet} />
      </RowGroup>

      <Sheet open={open} onClose={() => !pending && setOpen(false)} title="Выйти из аккаунта?">
        <p className="text-[16px] leading-[22px] text-muted">
          Задачи, сообщения и очки останутся на месте. Чтобы вернуться, понадобится пароль.
        </p>
        {held ? (
          // unsent recordings are not lost by a sign-out (principle 5): they wait for the person
          // to come back; on a shared phone they can be wiped instead (D-130 §9)
          <p className="mt-3 text-[16px] leading-[22px]" data-testid="signout-waiting">
            Ещё не отправлено: {held}. Отправлю сам, когда вы снова войдёте; другой человек на этом телефоне этого не увидит.
          </p>
        ) : null}
        <form ref={form} action={action} onSubmit={submit} className="mt-4 flex flex-col gap-2">
          <Button block type="submit" variant="danger" loading={pending}>
            {held ? "Выйти, отправить потом" : "Выйти"}
          </Button>
          {held ? (
            <Button
              block
              variant="secondary"
              disabled={pending}
              onClick={() => {
                erase.current = true;
                form.current?.requestSubmit();
              }}
            >
              Стереть и выйти
            </Button>
          ) : null}
          <Button block variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
            Отмена
          </Button>
        </form>
      </Sheet>
    </>
  );
}
