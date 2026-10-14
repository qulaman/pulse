import { LoginForm } from "@/components/auth/LoginForm";
import { loadBrandBySlug } from "@/lib/brand";

/**
 * A company's own sign-in screen (D-135): the QR of an issued code opens it, so the person
 * types the code under their company's logo and colour. An unknown address shows the product's
 * screen — it never says which companies exist (D-134).
 */
export default async function CompanyLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = await loadBrandBySlug(slug.toLowerCase());
  return (
    <LoginForm
      brand={{
        name: brand.name,
        logoUrl: brand.logoUrl,
        tagline: brand.tagline,
        accent: brand.customAccent ? brand.accent : undefined,
      }}
    />
  );
}
