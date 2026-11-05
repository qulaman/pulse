import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { OpsError } from "@/lib/ops/client";

/** The server's bare words, each with what to do next. */
const NEXT_STEP: Record<string, string> = {
  "Не найдено": "Этого уже нет: возможно, удалили только что. Обнови страницу",
  "Неверный запрос": "Сервер не принял данные. Проверь поля и попробуй ещё раз",
  "Нет доступа": "Нет доступа: открой консоль по её основному адресу",
};

/** What a failure says to the operator: the server's own words, or the one thing it can be without them. */
export function failureText(error: unknown): string {
  if (!(error instanceof OpsError)) return "Нет связи с сервером, попробуй ещё раз";
  return NEXT_STEP[error.message] ?? error.message;
}

/** A list that did not load: said in place of the list, with the way to try again. */
export function OpsFailure({ error, onRetry, title = "Не загрузилось" }: { error: unknown; onRetry: () => void; title?: string }) {
  return (
    <div className="ops-failure">
      <EmptyState
        title={title}
        hint={failureText(error)}
        action={
          <Button size="sm" variant="secondary" onClick={onRetry} data-testid="ops-retry">
            Повторить
          </Button>
        }
      />
    </div>
  );
}
