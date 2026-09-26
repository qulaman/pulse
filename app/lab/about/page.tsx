import { FullscreenButton } from "@/components/lab/pitch/parts";
import { PitchStory } from "@/components/lab/pitch/PitchStory";
import { PageHead } from "@/components/ui/PageHead";

/**
 * «Как работает Pulse»: the product in five minutes — how it works, what is under the hood and
 * what it gives the director and the company. The owner opens it before a live demo; the page
 * is its own title (the hero), so the head is the bar alone.
 */
export default function LabAboutPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 md:max-w-3xl lg:max-w-5xl">
      <PageHead bare back={{ href: "/lab", label: "Лаборатория" }} title="Как работает Pulse" tone="accent" actions={<FullscreenButton />} />
      <PitchStory />
    </main>
  );
}
