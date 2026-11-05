import { SettingsFrame } from "@/components/desk/settings/SettingsFrame";
import { deskDevTools } from "@/lib/lab/access";

/**
 * «Настройки» on the desk (D-153): the settings' own navigation beside every screen under it. The
 * developers' tools are decided here, on the server, so the navigation's first frame is right.
 */
export default async function DeskSettingsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsFrame devTools={await deskDevTools()}>{children}</SettingsFrame>;
}
