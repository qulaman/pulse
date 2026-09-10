import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfilePoints } from "@/components/profile/ProfilePoints";

import { getSessionProfile, type Role } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

const ROLE_RU: Record<Role, string> = {
  director: "Директор",
  manager: "Руководитель",
  employee: "Сотрудник",
  shopkeeper: "Магазин",
  tv: "ТВ-экран",
};

async function signOut() {
  "use server";
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function ProfilePage() {
  const profile = await getSessionProfile();

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      <h1 className="text-[24px] font-bold leading-[30px]">Профиль</h1>

      <dl className="mt-6 rounded-2xl border border-border bg-surface p-4">
        <dt className="text-[13px] leading-4 text-muted">Имя</dt>
        <dd className="mt-1 text-[16px] leading-[22px]">{profile.fullName}</dd>
        <dt className="mt-4 text-[13px] leading-4 text-muted">Роль</dt>
        <dd className="mt-1 text-[16px] leading-[22px]">{ROLE_RU[profile.role]}</dd>
      </dl>

      {profile.role === "director" ? (
        <Link
          href="/settings"
          className="mt-4 flex min-h-[52px] items-center justify-between rounded-[16px] border border-border bg-surface px-4 text-[16px] leading-[22px]"
        >
          Настройки
          <span className="text-[13px] leading-4 text-muted">распознавание · разбор · очки</span>
        </Link>
      ) : (
        <ProfilePoints userId={profile.userId} />
      )}

      <form action={signOut} className="mt-6">
        <button
          type="submit"
          className="min-h-[44px] w-full rounded-xl border border-border bg-surface-2 px-4 text-[16px] font-medium"
        >
          Выйти
        </button>
      </form>
    </main>
  );
}
