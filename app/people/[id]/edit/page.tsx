"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { use } from "react";

import { LoginCard } from "@/components/people/LoginCard";
import { PersonForm, draftOf, patchOf } from "@/components/people/PersonForm";
import { SectionBone, SkeletonGroup } from "@/components/ui/Skeleton";
import { assignableRoles, canChangeAccess, canEditPerson, canResetLogin } from "@/lib/people/access";
import { ROLE_LABEL, initialsOf, usePeople, usePerson, useUpdatePerson } from "@/lib/people/queries";
import { useMe } from "@/lib/tasks/queries";

/**
 * The person's editor (D-104): card, role, status and login on one screen, for the
 * director and the secretary alike. What each may touch comes from lib/people/access —
 * the same rules the database and the routes enforce.
 */
export default function EditPersonPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { id } = useParams<{ id: string }>();
  const { from } = use(searchParams);
  const me = useMe();
  const person = usePerson(id);
  const people = usePeople();
  const update = useUpdatePerson();

  const p = person.data;
  const back = from === "card" && p ? { href: `/people/${id}`, label: p.full_name } : { href: "/settings?tab=team", label: "Сотрудники" };
  const loading = person.isLoading || me.isLoading || people.isLoading;
  const editor = me.data ? { id: me.data.userId, role: me.data.role } : null;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-40 pt-5">
      <Link href={back.href} className="text-[13px] leading-4 text-muted">
        ← {back.label}
      </Link>
      {loading ? (
        <SkeletonGroup className="mt-4 flex flex-col gap-4">
          <SectionBone fields={3} />
          <SectionBone fields={4} />
          <SectionBone fields={2} />
        </SkeletonGroup>
      ) : !p || !editor ? (
        <p className="mt-4 text-[16px] leading-[22px] text-muted">Сотрудник не найден</p>
      ) : !canEditPerson(editor, p) ? (
        <p className="mt-4 card px-4 py-6 text-center text-[16px] leading-[22px] text-muted">Карточку директора меняет только директор</p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-3">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[19px] font-semibold text-bg"
              style={{ background: "linear-gradient(135deg, var(--accent), #1FA88F)", opacity: p.is_active ? 1 : 0.55 }}
            >
              {initialsOf(p.full_name)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[24px] font-bold leading-[30px]">{p.full_name}</h1>
              <p className="truncate text-[13px] leading-4 text-muted">
                {[
                  ROLE_LABEL[p.role],
                  p.position?.toLowerCase() === ROLE_LABEL[p.role].toLowerCase() ? null : p.position,
                  p.is_active ? null : "не работает",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <div className="mt-6">
            <PersonForm
              key={p.id}
              mode="edit"
              initial={draftOf(p)}
              roles={assignableRoles(editor.role, p.role)}
              lockedRole={
                canChangeAccess(editor, p)
                  ? undefined
                  : editor.id === p.id
                    ? "Свою роль и доступ здесь не меняют — иначе можно закрыть себе вход в настройки"
                    : "Роль директора меняет только директор"
              }
              managers={(people.data ?? []).filter((m) => m.id !== id && m.is_active && (m.role === "manager" || m.role === "director"))}
              roster={(people.data ?? []).filter((m) => m.id !== id && m.is_active && m.role !== "tv")}
              pending={update.isPending}
              onSubmit={(draft) => update.mutateAsync({ id, patch: patchOf(draft, canChangeAccess(editor, p)) })}
              footer={canResetLogin(editor, p) ? <LoginCard person={p} /> : null}
            />
          </div>
        </>
      )}
    </main>
  );
}
