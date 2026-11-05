import { Suspense } from "react";

import { CompanyRegistry } from "@/components/ops/registry/CompanyRegistry";

export default function OpsHomePage() {
  // the search lives in the address, and reading it wants a boundary of its own
  return (
    <Suspense>
      <CompanyRegistry />
    </Suspense>
  );
}
