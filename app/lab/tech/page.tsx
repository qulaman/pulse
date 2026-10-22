import { FullscreenButton } from "@/components/lab/pitch/parts";
import { TechStory } from "@/components/lab/tech/TechStory";
import { PageHead } from "@/components/ui/PageHead";

/**
 * «Технология»: the pipeline as a moving system map — one phrase from the director's phone
 * through the cloud to the employee's phone, with the failure modes, the walls between
 * companies and the stack. Opened next to «Как работает Pulse» when someone asks how it works
 * inside; the hero is the title, so the head is the bar alone.
 */
export default function LabTechPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 md:max-w-3xl lg:max-w-5xl">
      <PageHead bare back={{ href: "/lab", label: "Лаборатория" }} title="Технология" tone="accent" actions={<FullscreenButton />} />
      <TechStory />
    </main>
  );
}
