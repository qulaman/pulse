"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { initialsOf } from "@/lib/people/queries";
import { useDisputePoints, useMyDisputes, type MyDispute } from "@/lib/points/game";
import { useBalance, usePointHistory, type PointRow, type RatingRow } from "@/lib/points/queries";

const SOURCE_LABEL: Record<string, string> = {
  manual: "от директора",
  auto_rule: "за задачу",
  reaction: "реакция",
  shop_hold: "магазин",
  shop_release: "возврат",
};

/**
 * A person's points, line by line: what for and when. The director sees anyone's
 * (RLS), a person sees their own — for a colleague the sheet shows the summary only.
 */
export function PointsSheet({
  row,
  canRead,
  canAward,
  onClose,
  onAward,
}: {
  row: RatingRow | null;
  canRead: boolean;
  canAward: boolean;
  onClose: () => void;
  onAward: (row: RatingRow) => void;
}) {
  const history = usePointHistory(row && canRead ? row.user_id : undefined);
  // the whole ledger summed by the database — the list below shows only its last rows (D-126)
  const total = useBalance(row && canRead ? row.user_id : undefined);
  const balance = total.data ?? 0;
  // «Оспорить» (D-14, D-133): the person's own minus goes to the director with a few words
  const disputes = useMyDisputes(row?.is_me ? row.user_id : undefined);
  const dispute = useDisputePoints(row?.is_me ? row.user_id : undefined);

  return (
    <Sheet open={row !== null} onClose={onClose} title={row?.display_name ?? ""}>
      {row ? (
        <>
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[16px] font-semibold text-bg"
              style={{ background: "linear-gradient(135deg, var(--accent), #1FA88F)" }}
            >
              {initialsOf(row.display_name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="nums text-[13px] leading-4 text-muted">
                {row.rank} место · {row.on_time_pct !== null ? `${row.on_time_pct}% в срок` : "без закрытых задач"}
              </p>
              <p className="nums text-[24px] font-bold leading-[30px]" style={{ color: "var(--gold)" }}>
                {row.points} <span className="text-[13px] font-normal text-muted">за период</span>
                {canRead && total.data !== undefined ? (
                  <span className="ml-2 text-[13px] font-normal text-muted">· всего {balance}</span>
                ) : null}
              </p>
            </div>
            {canAward ? (
              <Button variant="secondary" className="!min-h-[40px] !px-3 !text-[14px]" onClick={() => onAward(row)}>
                Поощрить
              </Button>
            ) : null}
          </div>

          {canRead ? (
            <div className="mt-4">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">За что</p>
              {history.isLoading ? (
                <SkeletonGroup className="mt-2 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Bone key={i} h={40} className="rounded-[12px]" />
                  ))}
                </SkeletonGroup>
              ) : (history.data ?? []).length === 0 ? (
                <p className="mt-2 text-[14px] leading-[18px] text-muted">Очков пока не было</p>
              ) : (
                <ul className="no-bar mt-2 max-h-[40vh] space-y-1.5 overflow-y-auto">
                  {(history.data ?? []).slice(0, 30).map((line) => (
                    <HistoryLine
                      key={line.id}
                      line={line}
                      dispute={disputes.data?.[line.id]}
                      canDispute={row.is_me && isDisputable(line)}
                      onDispute={(text) => dispute.mutate({ transactionId: line.id, text })}
                      sending={dispute.isPending}
                    />
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="mt-4 text-[13px] leading-4 text-muted">Подробности начислений видит только сам человек и директор</p>
          )}
        </>
      ) : null}
    </Sheet>
  );
}

/** A minus the person may dispute: not a shop hold — that is their own order, not a judgement. */
function isDisputable(line: PointRow): boolean {
  return line.amount < 0 && line.source !== "shop_hold" && line.source !== "shop_release";
}

const DISPUTE_WORD: Record<MyDispute["status"], string> = {
  open: "оспорено · ждёт ответа",
  refunded: "вернули",
  kept: "оставили",
};

/**
 * One line of the history. On the person's own minus — «Оспорить»: the line opens in place into a
 * field and «Отправить» (no second sheet over the first); after that it says where the dispute
 * stands and, once answered, the director's words.
 */
function HistoryLine({
  line,
  dispute,
  canDispute,
  onDispute,
  sending,
}: {
  line: PointRow;
  dispute: MyDispute | undefined;
  canDispute: boolean;
  onDispute: (text: string) => void;
  sending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  return (
    <li className="rounded-[12px] bg-surface-2 px-3 py-2 text-[14px] leading-[18px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate">
          <span className="nums font-semibold" style={{ color: line.amount > 0 ? "var(--gold)" : "var(--danger)" }}>
            {line.amount > 0 ? `+${line.amount}` : line.amount}
          </span>{" "}
          {line.reason ?? SOURCE_LABEL[line.source] ?? ""}
        </span>
        <span className="nums shrink-0 text-[12px] text-muted">{humanAqtobe(new Date(line.created_at))}</span>
      </div>
      {dispute ? (
        <p className="mt-1 text-[12px] leading-4" style={{ color: dispute.status === "refunded" ? "var(--ok)" : "var(--text-muted)" }} data-testid="dispute-state">
          {DISPUTE_WORD[dispute.status]}
          {dispute.answer ? ` · «${dispute.answer}»` : ""}
        </p>
      ) : canDispute && !editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          data-testid="dispute-open"
          className="mt-1 min-h-[32px] text-[13px] font-semibold leading-4 text-accent"
        >
          Оспорить
        </button>
      ) : null}
      {editing && !dispute ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            autoFocus
            rows={2}
            maxLength={500}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Почему не согласны — пара слов директору"
            className="field w-full resize-none px-3 py-2 text-[16px] leading-[22px] outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <Button
              block
              disabled={sending || text.trim().length === 0}
              onClick={() => {
                onDispute(text.trim());
                setEditing(false);
              }}
              data-testid="dispute-send"
            >
              Отправить директору
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
