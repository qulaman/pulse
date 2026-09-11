import { redirect } from "next/navigation";

import { NotificationsRow } from "@/components/profile/NotificationsRow";
import { PasswordRow } from "@/components/profile/PasswordRow";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

async function signOut() {
  "use server";
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function ProfilePage() {
  const profile = await getSessionProfile();
  const director = profile.role === "director";

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Профиль</h1>

      <div className="mt-4">
        <ProfileCard userId={profile.userId} fullName={profile.fullName} role={profile.role} />
      </div>

      <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-wide text-muted">Личное</h2>
      <div className="mt-2 flex flex-col gap-2">
        <PasswordRow />
        <NotificationsRow />
        <div className="flex min-h-[52px] items-center justify-between gap-3 card px-4 text-[16px] leading-[22px]">
          Telegram
          <span className="text-[13px] leading-4 text-muted">привязка — с доставкой уведомлений</span>
        </div>
      </div>
      {director ? (
        <p className="mt-3 text-[13px] leading-4 text-muted">
          Настройки компании — распознавание, разбор, очки, сотрудники, данные — на вкладке «Настройки»
        </p>
      ) : null}

      <form action={signOut} className="mt-6">
        <button
          type="submit"
          className="min-h-[44px] w-full field px-4 text-[16px] font-medium"
        >
          Выйти
        </button>
      </form>
    </main>
  );
}
