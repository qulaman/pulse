import { Suspense } from "react";

import { CompanyScreen } from "@/components/ops/company/CompanyScreen";

export default async function OpsCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // the section lives in the address, and reading it wants a boundary of its own
  return (
    <Suspense>
      <CompanyScreen id={id} />
    </Suspense>
  );
}
