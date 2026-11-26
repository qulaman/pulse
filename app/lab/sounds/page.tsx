import { SoundsBench } from "@/components/lab/SoundsBench";
import { PageHead } from "@/components/ui/PageHead";

/** The sounds bench: hear every moment, try another voice and loudness on this device (D-204). */
export default function LabSoundsPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead back={{ href: "/lab", label: "Лаборатория" }} title="Звуки" />
      <div className="mt-4">
        <SoundsBench />
      </div>
    </main>
  );
}
