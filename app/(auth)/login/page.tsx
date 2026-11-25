import { LoginForm } from "@/components/auth/LoginForm";
import { sessionIsClosed } from "@/lib/auth";
import { PRODUCT_BRAND } from "@/lib/brand";

/**
 * Server wrapper. Nobody is signed in here, so the screen carries the product's own brand: the
 * base holds many companies and none of them is «the» one (D-134). A company's own sign-in
 * screen is `/c/<slug>` (D-135); after a code, the answer carries the company's brand.
 */
export default async function LoginPage() {
  const closed = await sessionIsClosed();
  return (
    <LoginForm
      brand={{ name: PRODUCT_BRAND.name, logoUrl: PRODUCT_BRAND.logoUrl, tagline: PRODUCT_BRAND.tagline }}
      closed={closed}
    />
  );
}
