"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { PersonForm, draftOf, patchOf } from "@/components/people/PersonForm";
import { ResetPasswordCard } from "@/components/people/ResetPasswordCard";
import { TaskSkeleton } from "@/components/tasks/TaskSkeleton";
import { initialsOf, usePeople, usePerson, useUpdatePerson } from "@/lib/people/queries";

export default function EditPersonPage() {
  const { id } = useParams<{ id: string }>();
  const person = usePerson(id);
  const people = usePeople();
  const update = useUpdatePerson();
  const managers = (people.data ?? []).filter((p) => p.id !== id && p.is_active && (p.role === "manager" || p.role === "director"));

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <Link href="/people" className="text-[13px] leading-4 text-muted">← Сотрудники</Link>
      {person.isLoading ? (
        <div className="mt-4"><TaskSkeleton count={1} /></div>
      ) : person.data ? (
        <>
          <div className="mt-3 flex items-center gap-3">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[19px] font-semibold text-bg"
              style={{ background: "linear-gradient(135deg, var(--accent), #1FA88F)" }}
            >
              {initialsOf(person.data.full_name)}
            </span>
            <h1 className="text-[24px] font-bold leading-[30px]">{person.data.full_name}</h1>
          </div>
          <div className="mt-5">
            <PersonForm
              key={person.data.id}
              mode="edit"
              initial={draftOf(person.data)}
              managers={managers}
              pending={update.isPending}
              onSubmit={(draft) => update.mutate({ id, patch: patchOf(draft) })}
            />
          </div>
          {person.data.role !== "tv" ? (
            <div className="mt-4">
              <ResetPasswordCard personId={person.data.id} />
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-[16px] leading-[22px] text-muted">Сотрудник не найден</p>
      )}
    </main>
  );
}
