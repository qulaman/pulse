"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { Row } from "@/components/ui/Row";
import type { CompanySettings } from "@/lib/settings";
import { fetchSettings, settingsKey } from "@/lib/settings-query";

async function saveLabForAll(on: boolean): Promise<CompanySettings> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lab_for_all: on }),
  });
  if (!res.ok) throw new Error("save failed");
  return ((await res.json()) as { settings: CompanySettings }).settings;
}

function FlaskIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.5 3h5M10 3v6.2L4.8 18.3A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.7L14 9.2V3" />
      <line x1="7.5" y1="15" x2="16.5" y2="15" />
    </svg>
  );
}

/**
 * «Лаборатория для всех» (D-150): while the company tests the product, the team gets «Лаб» on
 * its bar — the haptics bench, «Как работает Pulse», «Технология», the mascot shelf; the
 * model, parser and cost benches stay with the director and the secretary. Off at release.
 * The switch moves at once and rolls back if the save fails.
 */
export function LabForAllRow() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: settingsKey, queryFn: fetchSettings });
  const save = useMutation({
    mutationFn: saveLabForAll,
    onMutate: async (on) => {
      await queryClient.cancelQueries({ queryKey: settingsKey });
      const before = queryClient.getQueryData<CompanySettings>(settingsKey);
      if (before) queryClient.setQueryData<CompanySettings>(settingsKey, { ...before, lab_for_all: on });
      return { before };
    },
    onError: (_error, _on, context) => {
      if (context?.before) queryClient.setQueryData(settingsKey, context.before);
      toast("Не получилось сохранить. Попробуй ещё раз");
    },
    onSuccess: (next) => {
      queryClient.setQueryData(settingsKey, next);
      toast(next.lab_for_all ? "Открыл лабораторию команде" : "Лаборатория снова только у вас");
    },
  });

  return (
    <div className="mb-3">
      <div className="card overflow-hidden">
        {settings.data ? (
          <Row icon={<FlaskIcon />} title="Лаборатория для всех" toggle={{ on: settings.data.lab_for_all, onChange: (on) => save.mutate(on) }} />
        ) : (
          // the switch's state is the server's: until it is known the row waits instead of guessing «off»
          <Row icon={<FlaskIcon />} title="Лаборатория для всех" busy onClick={() => {}} />
        )}
      </div>
      <p className="mt-2 px-1 text-[13px] leading-[18px] text-muted">
        На время тестирования у сотрудников появится вкладка «Лаб»: вибрация, «Как работает Pulse», «Технология», маскот. Модели, парсер и
        себестоимость остаются у директора и секретаря. Перед релизом выключите.
      </p>
    </div>
  );
}
