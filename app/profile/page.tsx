import { redirect } from "next/navigation";

import { InstallHint } from "@/components/InstallHint";
import { PulseMark } from "@/components/brand/PulseMark";
import { NotificationsRow } from "@/components/profile/NotificationsRow";
import { PasswordRow } from "@/components/profile/PasswordRow";
import { PointsCard } from "@/components/profile/PointsCard";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { Row, RowGroup } from "@/components/ui/Row";
import { SignOutRow } from "@/components/profile/SignOutRow";
import { VersionRow } from "@/components/profile/VersionRow";
import { GearIcon, SendIcon } from "@/components/profile/icons";
import { getSessionProfile } from "@/lib/auth";
import { canManageTeam } from "@/lib/routes";
import { createServerSupabase } from "@/lib/supabase/server";
import { BUILD, versionLabel } from "@/lib/version";

async function signOut() {
  "use server";
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Профиль: who is signed in (the card is the page's heading), the points card for an
 * employee, then the short list of everything this person can actually change about
 * themselves. Company configuration is the director's and the secretary's screen (D-104) —
 * here it is one row, not a second settings page.
 */
export default async function ProfilePage() {
  const profile = await getSessionProfile();
  const director = profile.role === "director";
  // read here, not in the browser: whether points exist at all decides the page's shape
  const supabase = await createServerSupabase();
  const company = await supabase.from("companies").select("settings").limit(1).maybeSingle();
  const pointsEnabled = (company.data?.settings as { points_enabled?: boolean } | null)?.points_enabled === true;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-4">
      <ProfileCard userId={profile.userId} fullName={profile.fullName} role={profile.role} />
      {director ? null : <PointsCard userId={profile.userId} enabled={pointsEnabled} />}

      <h2 className="eyebrow mt-6 px-1">Личное</h2>
      <RowGroup className="mt-2">
        <PasswordRow />
        <NotificationsRow />
        <Row icon={<SendIcon />} title="Telegram" tone="muted" value="скоро" />
      </RowGroup>

      {canManageTeam(profile.role) ? (
        <>
          <h2 className="eyebrow mt-6 px-1">Компания</h2>
          <RowGroup className="mt-2">
            <Row icon={<GearIcon />} title="Настройки" value={director ? "голос, разбор, очки" : "команда, роли, пароли"} href="/settings" />
          </RowGroup>
        </>
      ) : null}

      <h2 className="eyebrow mt-6 px-1">Приложение</h2>
      <RowGroup className="mt-2">
        <VersionRow />
      </RowGroup>

      <InstallHint />

      <SignOutRow action={signOut} className="mt-6" />

      <footer className="mt-8 flex flex-col items-center gap-1.5 opacity-45">
        <PulseMark />
        {/* the build this page came from — the same one the phone runs (D-115) */}
        <p className="nums text-[12px] leading-4 text-muted">
          версия {versionLabel(BUILD)}
          {BUILD.at && BUILD.sha ? ` · ${BUILD.sha}` : ""}
        </p>
      </footer>
    </main>
  );
}
