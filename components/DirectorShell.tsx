import type { ReactNode } from "react";

import { AppHeader } from "@/components/AppHeader";
import { NotesReplay } from "@/components/notes/NotesReplay";
import { TabBar } from "@/components/TabBar";
import { DirectorFab } from "@/components/voice/DirectorFab";

/**
 * The director's chrome: header, tab bar, the draft pill and the «Дать задачу» sheet
 * (DirectorFab — a person's card asks it for the sheet), the notes replay. One piece for
 * the (director) group and for the routes the director shares with the secretary (D-104).
 */
export function DirectorShell({ fullName, companyId, children }: { fullName: string; companyId: string; children: ReactNode }) {
  return (
    <div className="app-shell flex min-h-dvh flex-col">
      <AppHeader fullName={fullName} companyId={companyId} />
      {children}
      <TabBar role="director" />
      <DirectorFab />
      <NotesReplay />
    </div>
  );
}
