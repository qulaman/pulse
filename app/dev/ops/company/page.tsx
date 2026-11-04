"use client";

import { Suspense } from "react";

import { CompanyScreen } from "@/components/ops/company/CompanyScreen";
import { OpsFrame } from "@/components/ops/shell/OpsFrame";
import { OpsProviders } from "@/components/ops/shell/OpsProviders";

/** The company card on canned answers: the sandbox's browser run stubs `/api/ops/*`. */
export default function DevOpsCompanyPage() {
  return (
    <OpsProviders>
      <OpsFrame email="dev@pulse.test">
        <Suspense>
          <CompanyScreen id="11111111-1111-1111-1111-111111111111" />
        </Suspense>
      </OpsFrame>
    </OpsProviders>
  );
}
