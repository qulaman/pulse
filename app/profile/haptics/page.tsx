import { HapticsChoice } from "@/components/profile/HapticsChoice";
import { PageHead } from "@/components/ui/PageHead";

/**
 * Профиль → «Вибрация» (D-193): on for this phone or not, and on an iPhone the way its tick is
 * carried — chosen by the person here, not in «Лаб», which a client's people never see (D-158).
 */
export default function HapticsPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <PageHead back={{ href: "/profile", label: "Профиль" }} title="Вибрация" sub="Короткий щелчок под пальцем при нажатии. Настраивается на каждом телефоне отдельно." />
      <HapticsChoice />
    </main>
  );
}
