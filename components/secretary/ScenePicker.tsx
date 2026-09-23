"use client";

import { SecretaryMascot } from "@/components/secretary/SecretaryMascot";
import { DESK_SCENES, SCENE_NAME, sceneOfAction, type DeskScene } from "@/lib/errands/scene";
import type { SecretaryAction } from "@/lib/settings";

/**
 * Which animation the secretary's face plays for a catalogue button (D-97): «сама по надписи»
 * by default — the code of a default button or the words of its label — or one chosen here.
 * The small secretary next to the select plays it, so the director sees the choice.
 */
export function ScenePicker({
  action,
  className,
  onChange,
}: {
  action: Pick<SecretaryAction, "code" | "label" | "scene">;
  className: string;
  onChange: (scene: DeskScene | undefined) => void;
}) {
  const auto = sceneOfAction({ code: action.code, label: action.label });
  const current = action.scene ?? auto;
  return (
    <div className="flex items-center gap-2 pl-[64px]">
      <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2/60" data-testid="scene-preview" data-scene={current}>
        <SecretaryMascot mini size={40} scene={current} phase="doing" />
      </span>
      <select
        className={className}
        aria-label="Что делает секретарь"
        value={action.scene ?? ""}
        onChange={(event) => onChange(event.target.value ? (event.target.value as DeskScene) : undefined)}
      >
        <option value="">Сама по надписи — {SCENE_NAME[auto].toLowerCase()}</option>
        {DESK_SCENES.map((scene) => (
          <option key={scene} value={scene}>
            {SCENE_NAME[scene]}
          </option>
        ))}
      </select>
    </div>
  );
}
