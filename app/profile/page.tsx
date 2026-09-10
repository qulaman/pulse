import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileCard } from "@/components/profile/ProfileCard";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

async function signOut() {
  "use server";
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}

function Row({ href, title, hint }: { href: string; title: string; hint: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-[52px] items-center justify-between gap-3 rounded-[16px] border border-border bg-surface px-4 text-[16px] leading-[22px]"
    >
      {title}
      <span className="text-[13px] leading-4 text-muted">{hint} ›</span>
    </Link>
  );
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

      <div className="mt-4 flex flex-col gap-2">
        {director ? (
          <>
            <Row href="/sent" title="Отправленные" hint="все поручения по дням" />
            <Row href="/people" title="Сотрудники" hint="карточки, алиасы, роли" />
            <Row href="/settings" title="Настройки" hint="распознавание, разбор, очки" />
            <Row href="/admin" title="Данные" hint="таблицы компании" />
          </>
        ) : null}
        <Row href="/rating" title="Рейтинг" hint="очки за неделю и месяц" />
        <div className="flex min-h-[52px] items-center justify-between gap-3 rounded-[16px] border border-border bg-surface px-4 text-[16px] leading-[22px]">
          Telegram
          <span className="text-[13px] leading-4 text-muted">привязка — с доставкой уведомлений</span>
        </div>
      </div>

      <form action={signOut} className="mt-6">
        <button
          type="submit"
          className="min-h-[44px] w-full rounded-[12px] border border-border bg-surface-2 px-4 text-[16px] font-medium"
        >
          Выйти
        </button>
      </form>
    </main>
  );
}
