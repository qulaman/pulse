"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { RulesCard } from "@/components/lab/parser/RulesCard";
import { SideResult } from "@/components/lab/parser/parts";
import { call, COMPANY_RUN, FIELD, modelName, runOf, when } from "@/components/lab/parser/shared";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { SectionBone, SkeletonGroup } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { PARSER_KINDS } from "@/lib/ai/kinds/names";
import { normalizeRules } from "@/lib/ai/rules";
import { pct } from "@/lib/lab/format";
import type { ParserLabState, TryResponse } from "@/lib/lab/parser";
import type { ParserRulesVersion } from "@/lib/settings";

/**
 * «Парсер» in the lab (D-138): the company's own rules on top of the core prompt. A draft is
 * tried on a phrase, then on the whole corpus; it is saved only when the run of exactly that
 * text on the company's model passed the gates — the server checks the signed run again.
 * Below — what the model sees, and the versions to take back into the draft.
 */

function SandboxCard({ draft, runKey, activeText }: { draft: string; runKey: string; activeText: string }) {
  const [phrase, setPhrase] = useState("");
  const tryIt = useMutation({
    mutationFn: () =>
      call<TryResponse>("/api/lab/parser/try", {
        method: "POST",
        body: JSON.stringify({ transcript: phrase, rules: draft, compare: true, run: runOf(runKey) }),
      }),
    onError: (error) => toast(error instanceof Error ? error.message : "Не получилось разобрать"),
  });
  const result = tryIt.data;
  const sameRules = normalizeRules(draft) === activeText;

  return (
    <section className="card p-4">
      <h2 className="text-[19px] font-semibold leading-6">Песочница</h2>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        Фраза разбирается как написанная директором: ваш ростер, слова о сроках и {sameRules ? "действующие правила" : "черновик рядом с действующими правилами"}. Ничего не отправляю и не сохраняю.
      </p>
      <textarea
        className={`${FIELD} mt-3 min-h-[88px]`}
        value={phrase}
        maxLength={2000}
        placeholder="Марат, подготовь КП по Альфе к пятнице"
        onChange={(e) => setPhrase(e.target.value)}
        data-testid="parser-try-phrase"
        aria-label="Фраза для разбора"
      />
      <Button
        block
        className="mt-3"
        disabled={phrase.trim() === ""}
        loading={tryIt.isPending}
        onClick={() => tryIt.mutate()}
        data-testid="parser-try"
      >
        Разобрать
      </Button>
      {result ? (
        <div className="mt-4 flex flex-col gap-4" data-testid="parser-try-result">
          <SideResult title={result.current ? "С черновиком" : "Результат"} side={result.draft} />
          {result.current ? <SideResult title="С действующими правилами" side={result.current} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function PromptCard({ state }: { state: ParserLabState }) {
  const { prompt } = state;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="eyebrow mt-2 px-1">Что видит модель</h2>
      <p className="px-1 text-[13px] leading-4 text-muted">
        {prompt.tokens === null ? "Системный текст, ростер и примеры" : `≈ ${prompt.tokens.toLocaleString("ru-RU")} токенов: системный текст, ростер и примеры`} — едут перед каждой фразой. Дата и сама фраза — отдельным сообщением.
      </p>
      <Disclosure
        title="Системный промпт"
        // the text is assembled from the kinds the company has on (task 026); `??` — a cached state from before them
        summary={`${prompt.system.length.toLocaleString("ru-RU")} знаков${
          (state.parser.kinds ?? PARSER_KINDS).length < PARSER_KINDS.length
            ? ` · видов ${(state.parser.kinds ?? PARSER_KINDS).length} из ${PARSER_KINDS.length}`
            : ""
        }${state.versions[0]?.text ? " · с правилами компании" : ""}`}
      >
        <pre className="no-bar max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-[12px] leading-[17px]" data-testid="parser-system-prompt">
          {prompt.system}
        </pre>
      </Disclosure>
      <Disclosure title="Сотрудники" summary={`${prompt.rosterSize} в ростере · отдельный блок под кэш`}>
        <pre className="no-bar max-h-[50vh] overflow-auto whitespace-pre-wrap break-words text-[12px] leading-[17px]">{prompt.roster}</pre>
      </Disclosure>
      <Disclosure title="Примеры" summary={`${prompt.examples.length} пар · правятся в коде с прогоном корпуса`}>
        <ol className="flex flex-col divide-y divide-border">
          {prompt.examples.map((example, index) => (
            <li key={index} className="py-3 first:pt-0 last:pb-0">
              <p className="whitespace-pre-wrap text-[13px] leading-[18px]">{example.user}</p>
              <details className="mt-1">
                <summary className="min-h-[36px] cursor-pointer text-[13px] font-medium leading-[36px] text-accent">Ответ модели</summary>
                <pre className="no-bar max-h-[40vh] overflow-auto whitespace-pre-wrap break-words text-[12px] leading-[17px] text-muted">{example.answer}</pre>
              </details>
            </li>
          ))}
        </ol>
      </Disclosure>
      <div className="card flex flex-col divide-y divide-border">
        <Link href="/settings?tab=ai" className="flex min-h-[52px] items-center justify-between gap-3 px-4">
          <span className="text-[15px] leading-5">Модели и слова о сроках</span>
          <span aria-hidden className="text-[18px] text-muted">›</span>
        </Link>
        <Link href="/settings/dictionary" className="flex min-h-[52px] items-center justify-between gap-3 px-4">
          <span className="text-[15px] leading-5">Словарь имён и слов</span>
          <span aria-hidden className="text-[18px] text-muted">›</span>
        </Link>
      </div>
    </div>
  );
}

function HistoryCard({ versions, onTake }: { versions: ParserRulesVersion[]; onTake: (text: string) => void }) {
  if (versions.length === 0) return null;
  return (
    <section className="card p-4">
      <h2 className="text-[19px] font-semibold leading-6">Версии</h2>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        {versions.length === 1 ? "Пока одна." : `Последние ${versions.length}.`} Вернуть старую — взять её в черновик, проверить и сохранить.
      </p>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {versions.map((v, index) => (
          <li key={v.version} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="nums text-[13px] font-semibold leading-[18px]">
                Версия {v.version}
                {index === 0 ? <span className="text-ok"> · действует</span> : null}
              </span>
              <span className="nums shrink-0 text-[12px] leading-4 text-muted">{when(v.saved_at)}</span>
            </div>
            <p className="mt-0.5 text-[12px] leading-4 text-muted">
              {v.saved_by_name ?? "—"}
              {v.eval ? ` · исполнитель ${pct(v.eval.assignee)}, F1 ${pct(v.eval.f1)}, ${modelName(v.eval.model)}` : ""}
            </p>
            {v.text ? (
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] leading-[18px]">{v.text}</p>
            ) : (
              <p className="mt-1 text-[13px] leading-[18px] text-muted">Правила убраны — разбор по ядру</p>
            )}
            {index > 0 && v.text ? (
              <Button variant="ghost" size="sm" className="mt-1 -ml-3" onClick={() => onTake(v.text)}>
                В черновик
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ParserPanel() {
  // under «lab»: the offline snapshot keeps nothing of the lab (lib/offline/persist.ts)
  const query = useQuery({
    queryKey: ["lab", "parser"],
    queryFn: () => call<ParserLabState>("/api/lab/parser"),
  });
  const [draft, setDraft] = useState<string | null>(null);
  const [runKey, setRunKey] = useState(COMPANY_RUN);

  if (!query.data) {
    return (
      <SkeletonGroup className="flex flex-col gap-4">
        <SectionBone fields={3} />
        <SectionBone fields={2} />
      </SkeletonGroup>
    );
  }

  const state = query.data;
  const activeText = state.versions[0]?.text ?? "";
  const text = draft ?? activeText;

  return (
    <div className="flex flex-col gap-4">
      <RulesCard state={state} draft={text} setDraft={setDraft} runKey={runKey} setRunKey={setRunKey} />
      <SandboxCard draft={text} runKey={runKey} activeText={activeText} />
      <PromptCard state={state} />
      <HistoryCard
        versions={state.versions}
        onTake={(taken) => {
          setDraft(taken);
          window.scrollTo({ top: 0, behavior: "smooth" });
          toast("Взял в черновик. Проверьте на корпусе и сохраните");
        }}
      />
    </div>
  );
}
