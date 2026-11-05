import { Suspense } from "react";

import { EtherDesk } from "@/components/desk/ether/EtherDesk";
import { DeskScreenBone } from "@/components/desk/ui/DeskScreenBone";

/** «Объявления» on the desk: the phone's Эфир for the director and the secretary. Reads `?id`. */
export default function DeskEtherPage() {
  return (
    <Suspense fallback={<DeskScreenBone title="Объявления" />}>
      <EtherDesk />
    </Suspense>
  );
}
