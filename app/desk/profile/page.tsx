import { redirect } from "next/navigation";

import { ProfileDesk } from "@/app/desk/profile/ProfileDesk";
import { DeskPage } from "@/components/desk/ui/PageTitle";
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
 * The desk's profile (D-153, D-154 wave 3): who is signed in, the account, this computer's
 * notifications and the director's rules, how this computer shows the desk, the sessions and
 * signing out — a computer's account page (`ProfileDesk`), not the phone's rows.
 */
export default async function DeskProfilePage() {
  const profile = await getSessionProfile();
  const brand = await loadBrand(profile.companyId);
  // the address the person signs in with on a computer: from the verified session, no extra read
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims.email === "string" && data.claims.email ? data.claims.email : null;

  return (
    <DeskPage width="narrow">
      <ProfileDesk userId={profile.userId} fullName={profile.fullName} role={profile.role} company={brand.name} email={email} signOut={signOut} />
    </DeskPage>
  );
}
