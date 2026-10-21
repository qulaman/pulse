import { HapticsBench } from "@/components/lab/HapticsBench";
import { PageHead } from "@/components/ui/PageHead";

/** The haptics bench: which way a real iPhone ticks under the finger (D-147). */
export default function LabHapticsPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead back={{ href: "/lab", label: "Лаборатория" }} title="Вибрация" />
      <div className="mt-4">
        <HapticsBench />
      </div>
    </main>
  );
}
