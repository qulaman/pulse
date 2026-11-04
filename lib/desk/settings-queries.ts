"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { TableSpec } from "@/components/admin/DataTable";
import { toast } from "@/components/ui/Toast";
import type { LabResponse } from "@/lib/lab/rows";
import type { CompanySettings } from "@/lib/settings";
import { fetchSettings, settingsKey } from "@/lib/settings-query";
import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * The desk's own reads and writes for «Настройки» (D-154 wave 3): the same routes and the same
 * table reads the phone's screens make, gathered as hooks so the desk's components never talk to
 * the network or to Supabase themselves. No new route, no new RPC.
 */

/* ---- the company card: name and brand (D-44), the routes of the phone's CompanyForm ---------- */

export type CompanyCard = { name: string; brand: { logo_url: string | null; accent: string | null; tagline: string | null } };

export const companyCardKey = ["desk", "company-card"] as const;

async function readCompany(): Promise<CompanyCard> {
  const res = await fetch("/api/company", { credentials: "include" });
  if (!res.ok) throw new Error("company read failed");
  return (await res.json()) as CompanyCard;
}

async function patchCompany(body: { name?: string; brand?: Partial<CompanyCard["brand"]> }): Promise<CompanyCard> {
  const res = await fetch("/api/company", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const answer = (await res.json().catch(() => null)) as { error?: { message_ru?: string } } | null;
    throw new Error(answer?.error?.message_ru ?? "Не получилось сохранить компанию");
  }
  return (await res.json()) as CompanyCard;
}

/** The company's name and brand as the server holds them. */
export function useCompanyCard() {
  return useQuery({ queryKey: companyCardKey, queryFn: readCompany, staleTime: 60_000 });
}

/** Name, tagline and accent in one PATCH; the cache takes the server's answer. */
export function useSaveCompanyCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patchCompany,
    onSuccess: (card) => queryClient.setQueryData(companyCardKey, card),
  });
}

/** A new logo file (PNG, JPEG, WebP, SVG up to 2 MB), or none: both land at once, outside the draft. */
export function useCompanyLogo() {
  const queryClient = useQueryClient();
  const put = (logo_url: string | null) =>
    queryClient.setQueryData<CompanyCard>(companyCardKey, (card) => (card ? { ...card, brand: { ...card.brand, logo_url } } : card));
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/company/logo", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message_ru?: string } } | null;
        throw new Error(body?.error?.message_ru ?? "Не удалось загрузить логотип");
      }
      return ((await res.json()) as { logo_url: string }).logo_url;
    },
    onSuccess: put,
  });
  const remove = useMutation({
    mutationFn: async () => (await patchCompany({ brand: { logo_url: null } })).brand.logo_url,
    onSuccess: put,
  });
  return { upload, remove };
}

/* ---- «Данные»: a company table, a page at a time, under the reader's RLS (the phone's /admin) -- */

export type TableRow = Record<string, unknown>;

/**
 * One page of a company table, newest first by the spec's order — the same read as the phone's
 * `DataTable`, read-only; RLS keeps it to the reader's company. The previous page stays on the
 * screen while the next one comes, so the grid never blinks empty between pages.
 */
export function useCompanyTable(spec: TableSpec, page: number, size: number) {
  return useQuery({
    queryKey: ["desk", "data", spec.table, page, size],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: TableRow[]; total: number }> => {
      const supabase = createBrowserSupabase();
      const from = page * size;
      const { data, error, count } = await supabase
        .from(spec.table as never)
        .select("*", { count: "exact" })
        .order(spec.orderBy, { ascending: spec.ascending ?? false })
        .range(from, from + size - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as TableRow[], total: count ?? 0 };
    },
  });
}

/* ---- «Лаборатория» (D-63): the model bench, the same route and cache entry as the phone's ---- */

export type LabSettings = LabResponse["settings"];

/** The models the company runs and the last recognitions, each call priced — read every 15 s while open. */
export function useLabBench() {
  return useQuery({
    queryKey: ["lab"],
    refetchInterval: 15_000,
    queryFn: async (): Promise<LabResponse> => {
      const res = await fetch("/api/lab", { credentials: "include" });
      if (!res.ok) throw new Error("lab failed");
      return (await res.json()) as LabResponse;
    },
  });
}

/** «Применить»: the STT and the parser models of the company, from the next recognition on. */
export function useApplyLabModels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<LabSettings>): Promise<LabSettings> => {
      const res = await fetch("/api/lab", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("save failed");
      return ((await res.json()) as { settings: LabSettings }).settings;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<LabResponse>(["lab"], (prev) => (prev ? { ...prev, settings: saved } : prev));
      void queryClient.invalidateQueries({ queryKey: settingsKey });
      // the «Парсер» tab runs the corpus on these models (D-138)
      void queryClient.invalidateQueries({ queryKey: ["lab", "parser"] });
      toast("Модели переключил");
    },
    onError: () => toast("Не получилось сохранить. Попробуйте ещё раз"),
  });
}

/**
 * «Лаборатория для всех» (D-150): the team gets «Лаб» on its bar while the company tests. The
 * switch moves at once and rolls back if the save fails — the phone's LabForAllRow, as a hook.
 */
export function useLabForAll() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: settingsKey, queryFn: fetchSettings });
  const save = useMutation({
    mutationFn: async (on: boolean): Promise<CompanySettings> => {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lab_for_all: on }),
      });
      if (!res.ok) throw new Error("save failed");
      return ((await res.json()) as { settings: CompanySettings }).settings;
    },
    onMutate: async (on) => {
      await queryClient.cancelQueries({ queryKey: settingsKey });
      const before = queryClient.getQueryData<CompanySettings>(settingsKey);
      if (before) queryClient.setQueryData<CompanySettings>(settingsKey, { ...before, lab_for_all: on });
      return { before };
    },
    onError: (_error, _on, context) => {
      if (context?.before) queryClient.setQueryData(settingsKey, context.before);
      toast("Не получилось сохранить. Попробуйте ещё раз");
    },
    onSuccess: (next) => {
      queryClient.setQueryData(settingsKey, next);
      toast(next.lab_for_all ? "Открыл лабораторию команде" : "Лаборатория снова только у вас");
    },
  });
  return { on: settings.data?.lab_for_all ?? null, set: (on: boolean) => save.mutate(on) };
}
