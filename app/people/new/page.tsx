"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Credentials } from "@/components/people/Credentials";
import { PersonForm, draftOf } from "@/components/people/PersonForm";
import { PageHead } from "@/components/ui/PageHead";
import { NewPersonFormBone } from "@/components/ui/PageSkeletons";
import { Sheet } from "@/components/ui/Sheet";
import { assignableRoles } from "@/lib/people/access";
import { useCreatePerson, usePeople } from "@/lib/people/queries";
import { useMe } from "@/lib/tasks/queries";

type Created = { id: string; name: string; email: string; password: string };

/**
 * A new person (D-104): email, a ready first password, card and role on one screen; after
 * «Добавить» the login is handed over in a sheet — copy it or send it to a messenger —
 * instead of a password the director has to remember and retype.
 */
export default function NewPersonPage() {
  const router = useRouter();
  const me = useMe();
  const people = usePeople();
  const create = useCreatePerson();
  const [created, setCreated] = useState<Created | null>(null);

  // the sheet keeps the login on screen through its closing slide: the route changes under it
  const finish = () => {
    // back to the list the person was added from; a direct link lands on the roster
    if (window.history.length > 1) router.back();
    else router.replace("/settings?tab=team");
  };

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead back={{ href: "/settings?tab=team", label: "Сотрудники" }} title="Новый сотрудник" />
      <div className="mt-5">
        {/* mounted only in the browser, once the roster is in: the ready password is random
            and must not be rendered twice (server and client), and the aliases need the roster */}
        {people.isLoading || !me.data ? (
          <NewPersonFormBone />
        ) : (
          <PersonForm
            mode="create"
            initial={draftOf(null)}
            roles={assignableRoles(me.data.role, null)}
            managers={(people.data ?? []).filter((p) => p.is_active && (p.role === "manager" || p.role === "director"))}
            roster={(people.data ?? []).filter((p) => p.is_active && p.role !== "tv")}
            pending={create.isPending}
            onSubmit={async (draft) => {
              const email = (draft.email ?? "").trim().toLowerCase();
              const password = draft.password ?? "";
              const { id } = await create.mutateAsync({
                email,
                password,
                full_name: draft.full_name.trim(),
                role: draft.role,
                position: draft.position.trim() || undefined,
                aliases: draft.aliases.split(/[,;\n]/).map((a) => a.trim()).filter(Boolean),
                manager_id: draft.manager_id,
              });
              setCreated({ id, name: draft.full_name.trim(), email, password });
            }}
          />
        )}
      </div>

      <Sheet open={created !== null} onClose={finish} title={created ? `${created.name.split(/\s+/)[0]} — в команде` : ""}>
        {created ? (
          <Credentials
            name={created.name}
            email={created.email}
            password={created.password}
            note="Это первый пароль. Свой можно поставить в «Профиле» — старый тогда перестанет работать."
            onDone={finish}
          />
        ) : null}
      </Sheet>
    </main>
  );
}
