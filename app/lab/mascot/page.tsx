import { MascotGallery } from "@/components/lab/MascotGallery";
import { PageHead } from "@/components/ui/PageHead";

/** The animation bench: every motion of the mascot that exists, on one screen (D-205). */
export default function LabMascotPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead
        back={{ href: "/lab", label: "Лаборатория" }}
        title="Анимации маскота"
      />
      <div className="mt-4">
        <MascotGallery />
      </div>
    </main>
  );
}
