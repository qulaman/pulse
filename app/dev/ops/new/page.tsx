"use client";

import { NewCompany } from "@/components/ops/company/NewCompany";
import { OpsFrame } from "@/components/ops/shell/OpsFrame";
import { OpsProviders } from "@/components/ops/shell/OpsProviders";

/** The new-company form on canned answers: the sandbox's browser run stubs `/api/ops/*`. */
export default function DevOpsNewPage() {
  return (
    <OpsProviders>
      <OpsFrame email="dev@pulse.test">
        <NewCompany />
      </OpsFrame>
    </OpsProviders>
  );
}
