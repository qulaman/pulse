import { notFound } from "next/navigation";

/** Component sandboxes exist in dev only. */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <div className="min-h-dvh">{children}</div>;
}
