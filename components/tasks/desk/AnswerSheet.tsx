"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { QUICK_ANSWERS } from "@/lib/tasks/desk";
import type { TaskActions } from "@/lib/tasks/mutations";
import { BUTTON } from "@/lib/tasks/status-text";

const FIELD_CLASS =
  "w-full field px-3 py-3 text-[16px] leading-[22px] text-text placeholder:text-muted outline-none focus:border-accent";

/**
 * «Ответить» from the display: the question, the quick answers of the card as chips (one
 * tap sends), and a field for the rest. The answer is an ordinary message of the thread —
 * the author's reply closes the question there (the same path as `QuestionBanner`).
 */
export function AnswerSheet({
  open,
  onClose,
  taskId,
  companyId,
  question,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  taskId: string;
  companyId: string;
  question: string;
  actions: TaskActions;
}) {
  const [text, setText] = useState("");

  const send = (value = text) => {
    const clean = value.trim();
    if (!clean) return;
    actions.sendMessage({ taskId, companyId, text: clean });
    setText("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Ответить">
      <blockquote
        className="border-l-2 pl-3 text-[15px] leading-[21px] text-muted"
        style={{ borderColor: "color-mix(in srgb, var(--warn) 55%, transparent)" }}
      >
        «{question}»
      </blockquote>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_ANSWERS.map((answer) => (
          <Chip key={answer} onClick={() => send(answer)}>
            {answer}
          </Chip>
        ))}
      </div>
      <textarea
        className={`${FIELD_CLASS} mt-3`}
        rows={3}
        placeholder="Ответ словами"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="mt-3">
        <Button block onClick={() => send()} disabled={!text.trim()}>
          {BUTTON.send}
        </Button>
      </div>
    </Sheet>
  );
}
