import { LoginForm } from "@/components/auth/LoginForm";
import { loadBrand } from "@/lib/brand";

/**
 * Server wrapper: the brand is read before anyone is signed in. Still the first company of
 * the base (V-02 era); D-134 §6 turns it into the product's brand — a company's own screen is
 * `/c/<slug>` (D-135).
 */
export default async function LoginPage() {
  const brand = await loadBrand();
  return <LoginForm brand={{ name: brand.name, logoUrl: brand.logoUrl, tagline: brand.tagline }} />;
}
