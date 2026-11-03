import { redirect } from "next/navigation";

import { IdentityCard } from "@/components/desk/ui/IdentityCard";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { PhoneViewRow } from "@/components/desk/ui/PhoneViewRow";
import { NotificationsRow } from "@/components/profile/NotificationsRow";
import { SignOutOthersRow } from "@/components/profile/SignOutOthersRow";
import { SignOutRow } from "@/components/profile/SignOutRow";
import { RowGroup } from "@/components/ui/Row";
import { getSessionProfile } from "@/lib/auth";
import { loadBrand } from "@/lib/brand";
import { createServerSupabase } from "@/lib/supabase/server";

async function signOut() {
  "use server";
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * The desk's profile (D-153): who is signed in, the director's notification rules (the phone's
 * screen — the only one there is, it opens as it is), signing out elsewhere and here, and the
 * way back to the phone screens on this computer.
 */
export default async function DeskProfilePage() {
  const profile = await getSessionProfile();
  const director = profile.role === "director";
  const brand = await loadBrand(profile.companyId);

  return (
    <DeskPage width="narrow">
      <PageTitle title="Профиль" />
      <IdentityCard fullName={profile.fullName} role={profile.role} company={brand.name} />

      <RowGroup>
        {director ? <NotificationsRow director /> : null}
        <SignOutOthersRow userId={profile.userId} />
        <PhoneViewRow role={profile.role} />
      </RowGroup>

      <SignOutRow action={signOut} userId={profile.userId} />
    </DeskPage>
  );
}
