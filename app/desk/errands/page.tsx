import { Suspense } from "react";

import { ErrandsDesk } from "@/components/desk/errands/ErrandsDesk";

/** «Секретарь» on the desk (tasks/022 B.4, D-197): the requests, their history, the buttons and the settings; `?e=` opens one in the panel. */
export default function DeskErrandsPage() {
  return (
    <Suspense>
      <ErrandsDesk />
    </Suspense>
  );
}
