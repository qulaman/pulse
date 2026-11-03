import { Suspense } from "react";

import { ErrandsDesk } from "@/components/desk/errands/ErrandsDesk";

/** «Заявки» on the desk (tasks/022 B.4): the secretary's queue, the director's view; `?e=` opens one in the panel. */
export default function DeskErrandsPage() {
  return (
    <Suspense>
      <ErrandsDesk />
    </Suspense>
  );
}
