"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

export type Person = Database["public"]["Tables"]["profiles"]["Row"];
export type Role = Database["public"]["Enums"]["user_role"];
export type Availability = Database["public"]["Enums"]["availability_t"];

export const ROLE_LABEL: Record<Role, string> = {
  director: "Директор",
  manager: "Руководитель",
  employee: "Сотрудник",
  shopkeeper: "Завхоз магазина",
  tv: "ТВ-экран",
};

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  active: "На месте",
  vacation: "В отпуске",
  sick: "На больничном",
};

export const peopleKeys = {
  all: ["people"] as const,
  one: (id: string) => ["people", id] as const,
};

/** Everybody in the company, inactive last — RLS shows the director the whole roster. */
export function usePeople() {
  return useQuery({
    queryKey: peopleKeys.all,
    queryFn: async (): Promise<Person[]> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("is_active", { ascending: false })
        .order("full_name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export type PersonMessage = Database["public"]["Tables"]["task_messages"]["Row"] & {
  task: { id: string; title: string } | null;
};

/** The last things this person said in task threads — the director's «Что писал». */
export function usePersonMessages(id: string) {
  return useQuery({
    queryKey: ["people", id, "messages"],
    queryFn: async (): Promise<PersonMessage[]> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("task_messages")
        .select("*, task:tasks!task_messages_task_id_fkey(id, title)")
        .eq("sender_id", id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PersonMessage[];
    },
  });
}

export function usePerson(id: string) {
  return useQuery({
    queryKey: peopleKeys.one(id),
    queryFn: async (): Promise<Person> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.from("profiles").select("*").eq("id", id).single();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export type PersonPatch = Partial<
  Pick<Person, "full_name" | "position" | "role" | "aliases" | "manager_id" | "availability" | "is_active">
>;

/** Direct update under RLS: the director policy plus trg_profiles_guard decide what is allowed. */
export function useUpdatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PersonPatch }) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["roster"] });
      toast("Сохранил");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "";
      toast(message.includes("forbidden_field_update") ? "Это поле менять нельзя" : "Не получилось сохранить");
    },
  });
}

export type NewPerson = {
  email: string;
  password: string;
  full_name: string;
  role: Role;
  position?: string;
  aliases?: string[];
  manager_id?: string | null;
};

/** Creating a login is a server job (service role): POST /api/people. */
export function useCreatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewPerson): Promise<{ id: string }> => {
      const res = await fetch("/api/people", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { code?: string; message_ru?: string } };
      if (!res.ok || !body.id) throw new Error(body.error?.message_ru ?? "Не получилось создать");
      return { id: body.id };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      toast("Сотрудник добавлен");
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Не получилось создать"),
  });
}

export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "•";
}
