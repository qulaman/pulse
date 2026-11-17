"use client";

import { AnimatePresence, LayoutGroup } from "motion/react";
import { memo, type ComponentProps } from "react";

/**
 * AnimatePresence whose «all have left» re-renders only what is inside it (D-178). Inside a screen's
 * LayoutGroup an AnimatePresence, once its exits are over, re-renders the whole group — every motion
 * component of Пульс or Лента, in the middle of the face's glide. Nothing on these screens needs that:
 * what leaves is popped out of the flow or placed absolutely, so nobody moves when it is gone. The
 * nested group keeps the screen's layout group, so what glides together still glides together.
 * Memoised: an empty one, or one given the same child, does not render again with the screen.
 */
export const LocalPresence = memo(function LocalPresence(props: ComponentProps<typeof AnimatePresence>) {
  return (
    <LayoutGroup>
      <AnimatePresence {...props} />
    </LayoutGroup>
  );
});
