import type { ParserLabState, RunModel } from "@/lib/lab/parser";
import { whenAqtobe } from "@/lib/lab/format";
// labels only — lib/settings.ts itself would bring zod into this page (D-126)
import { PARSER_MODEL_SHORT } from "@/lib/settings-plain";

/** What the parts of «Лаб → Парсер» (D-138) share: the field look, the API call, the words for models and dates. */

export const FIELD = "w-full field px-3 py-2.5 text-[16px] leading-[22px] text-text outline-none focus:border-accent";

/** The run on the company's own model switches — the only one that may be saved. */
export const COMPANY_RUN = "company";

export class ApiFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: { code: string; message_ru: string } }) | null;
  if (!res.ok || !body) throw new ApiFailure(body?.error?.code ?? "internal", body?.error?.message_ru ?? "Не получилось. Попробуйте ещё раз");
  return body;
}

export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} с`;
}

/** A model's date may be missing or broken — then no date, not «Invalid Date». */
export function when(iso: string | null): string | null {
  return iso && !Number.isNaN(Date.parse(iso)) ? whenAqtobe(iso) : null;
}

export function modelName(model: string): string {
  return PARSER_MODEL_SHORT[model] ?? model;
}

export function companyRunHint(parser: ParserLabState["parser"]): string {
  return parser.escalate
    ? `В компании: ${modelName(parser.model)}, перепроверка — ${modelName(parser.escalation_model)}`
    : `В компании: ${modelName(parser.model)}, без перепроверки`;
}

/** «company» — the company's switches; a model id — that model alone, without a second opinion. */
export function runOf(key: string): RunModel | undefined {
  return key === COMPANY_RUN ? undefined : { model: key, escalate: false, escalation_model: key };
}
