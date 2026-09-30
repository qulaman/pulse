import type { ReactNode } from "react";

import { AppHeader } from "@/components/AppHeader";
import { NotesReplay } from "@/components/notes/NotesReplay";
import { RoleScope } from "@/components/RoleScope";
import { TabBar } from "@/components/TabBar";
import { DirectorFab } from "@/components/voice/DirectorFab";
import { KeptPhrases } from "@/components/voice/KeptPhrases";
import type { Me } from "@/lib/tasks/queries";

/**
 * The director's chrome: header, tab bar, the draft pill and the «Дать задачу» sheet
 * (DirectorFab — a person's card asks it for the sheet), the notes replay, the phrases the
 * phone keeps and their pill (D-130). One piece for
 * the (director) group and for the routes the director shares with the secretary (D-104).
 */
export function DirectorShell({ me, children }: { me: Me; children: ReactNode }) {
  return (
    <div className="app-shell flex min-h-dvh flex-col">
      <AppHeader fullName={me.fullName} companyId={me.companyId} />
      <RoleScope role="director" me={me}>
        {children}
      </RoleScope>
      <TabBar role="director" />
      <DirectorFab />
      <NotesReplay />
      <KeptPhrases />
    </div>
  );
}
