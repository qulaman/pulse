import { SettingsFrame } from "@/components/desk/settings/SettingsFrame";

/** «Настройки» on the desk (D-153): the settings' own navigation beside every screen under it. */
export default function DeskSettingsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsFrame>{children}</SettingsFrame>;
}
