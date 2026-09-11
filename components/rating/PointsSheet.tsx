"use client";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { initialsOf } from "@/lib/people/queries";
import { balanceOf, usePointHistory, type RatingRow } from "@/lib/points/queries";

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
  const balance = balanceOf(history.data);

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
                {canRead && history.data ? (
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
                <ul className="mt-2 max-h-[40vh] space-y-1.5 overflow-y-auto">
                  {(history.data ?? []).slice(0, 30).map((line) => (
                    <li key={line.id} className="flex items-baseline justify-between gap-3 rounded-[12px] bg-surface-2 px-3 py-2 text-[14px] leading-[18px]">
                      <span className="min-w-0 truncate">
                        <span className="nums font-semibold" style={{ color: line.amount > 0 ? "var(--gold)" : "var(--danger)" }}>
                          {line.amount > 0 ? `+${line.amount}` : line.amount}
                        </span>{" "}
                        {line.reason ?? SOURCE_LABEL[line.source] ?? ""}
                      </span>
                      <span className="nums shrink-0 text-[12px] text-muted">{humanAqtobe(new Date(line.created_at))}</span>
                    </li>
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
