import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { OpsError } from "@/lib/ops/client";

/** What a failure says to the operator: the server's own words, or the one thing it can be without them. */
export function failureText(error: unknown): string {
  return error instanceof OpsError ? error.message : "Нет связи с сервером, попробуй ещё раз";
}

/** A list that did not load: said in place of the list, with the way to try again. */
export function OpsFailure({ error, onRetry, title = "Не загрузилось" }: { error: unknown; onRetry: () => void; title?: string }) {
  return (
    <EmptyState
      title={title}
      hint={failureText(error)}
      action={
        <Button size="sm" variant="secondary" onClick={onRetry} data-testid="ops-retry">
          Повторить
        </Button>
      }
    />
  );
}
