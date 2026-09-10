"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { PersonForm, draftOf } from "@/components/people/PersonForm";
import { useCreatePerson, usePeople } from "@/lib/people/queries";

export default function NewPersonPage() {
  const router = useRouter();
  const people = usePeople();
  const create = useCreatePerson();
  const managers = (people.data ?? []).filter((p) => p.is_active && (p.role === "manager" || p.role === "director"));

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <Link href="/people" className="text-[13px] leading-4 text-muted">← Сотрудники</Link>
      <h1 className="mt-2 text-[24px] font-bold leading-[30px]">Новый сотрудник</h1>
      <div className="mt-5">
        <PersonForm
          mode="create"
          initial={draftOf(null)}
          managers={managers}
          pending={create.isPending}
          onSubmit={(draft) =>
            create.mutate(
              {
                email: (draft.email ?? "").trim(),
                password: draft.password ?? "",
                full_name: draft.full_name.trim(),
                role: draft.role,
                position: draft.position.trim() || undefined,
                aliases: draft.aliases.split(/[,;\n]/).map((a) => a.trim()).filter(Boolean),
                manager_id: draft.manager_id,
              },
              { onSuccess: ({ id }) => router.replace(`/people/${id}`) },
            )
          }
        />
      </div>
    </main>
  );
}
