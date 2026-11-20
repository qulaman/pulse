import { TabShell } from "@/components/TabShell";

/**
 * The thread is shared by both roles, so it lives outside the (employee) and
 * (director) groups — but it still needs a session of its own. It keeps the tab
 * bar of the role: opening a card from a list and
 * going back must not repaint the chrome. The FAB steps aside here, as on /confirm:
 * the thread has its own composer at the bottom.
 */
export default function TaskThreadLayout({ children }: { children: React.ReactNode }) {
  return <TabShell>{children}</TabShell>;
}
