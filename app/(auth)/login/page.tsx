import { LoginForm } from "@/components/auth/LoginForm";
import { loadBrand } from "@/lib/brand";

/** Server wrapper: the brand is read before anyone is signed in (one company per instance, V-02). */
export default async function LoginPage() {
  const brand = await loadBrand();
  return <LoginForm brand={{ name: brand.name, logoUrl: brand.logoUrl, tagline: brand.tagline }} />;
}
