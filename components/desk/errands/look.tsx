"use client";

import {
  BellOff,
  CarTaxiFront,
  Coffee,
  CupSoda,
  Footprints,
  GlassWater,
  Handshake,
  Package,
  PenLine,
  Presentation,
  Printer,
  Siren,
  Stethoscope,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { INK, type Ink } from "@/components/desk/today/home/look";
import { Face, useAvatars } from "@/components/desk/ui/Face";
import type { Errand } from "@/lib/errands/queries";
import { sceneOf, type DeskScene } from "@/lib/errands/scene";
import type { SecretaryAction } from "@/lib/settings";

/*
 * The look of «Заявки» and «Объявления» (D-174): the request's scene as the icon «Сегодня» gives it
 * (D-169), people as their circles of «Команда» (D-172), the time a request waits as a clock that
 * warms. Drawn by app/desk/errands.css.
 */

/** Each request of the catalogue as a picture — the language of «Сегодня» (DayPult, D-196). */
export const SCENE_ICON: Record<DeskScene, LucideIcon> = {
  coffee: Coffee,
  tea: CupSoda,
  water: GlassWater,
  dnd: BellOff,
  security: Siren,
  guest: Handshake,
  meeting: Presentation,
  doctor: Stethoscope,
  come: Footprints,
  taxi: CarTaxiFront,
  print: Printer,
  lunch: UtensilsCrossed,
  courier: Package,
  other: PenLine,
};
/** Only two scenes carry an ink of their own: the alarm the red pencil, the closed door violet. */
export const SCENE_INK: Partial<Record<DeskScene, Ink>> = { security: "pencil", dnd: "violet" };

const tone = (ink: Ink): CSSProperties => ({ "--tone": INK[ink] }) as CSSProperties;

/** A scene as a small tile of its ink: what the request is, seen before it is read. */
export function SceneTile({ scene, size = 28, muted = false, className = "" }: { scene: DeskScene; size?: number; muted?: boolean; className?: string }) {
  const Glyph = SCENE_ICON[scene];
  return (
    <span
      aria-hidden
      className={`errands-tile ${className}`}
      data-scene={scene}
      data-muted={muted ? "" : undefined}
      style={{ ...tone(muted ? "muted" : (SCENE_INK[scene] ?? "pen")), width: size, height: size }}
    >
      <Glyph size={Math.round(size * 0.52)} strokeWidth={2.25} />
    </span>
  );
}

/** A request's tile: its scene by the company's catalogue. */
export function ErrandTile({ errand, catalogue, size, muted }: { errand: Pick<Errand, "kind" | "label">; catalogue: readonly SecretaryAction[]; size?: number; muted?: boolean }) {
  return <SceneTile scene={sceneOf(errand, catalogue)} size={size} muted={muted} />;
}

/**
 * A person's circle, as on «Команда»: the photo when the roster has one, else the initials on
 * their own hue. `ring` — the colour of what the person is doing for the screen.
 */
export function PersonFace({ id, name, size = 24, ring, away = false }: { id: string | null | undefined; name: string; size?: number; ring?: Ink | null; away?: boolean }) {
  const avatars = useAvatars();
  const avatar = id ? (avatars.get(id) ?? null) : null;
  return (
    <span className="errands-face" data-away={away ? "" : undefined} style={ring ? ({ "--ring": INK[ring] } as CSSProperties) : undefined}>
      <Face person={{ id: id ?? name, full_name: name || "?", avatar_url: avatar }} size={size} />
    </span>
  );
}

/** Faces in a row, each over the last: who read, who took. `more` — the rest as «+N». */
export function FaceStack({ children, more = 0, label }: { children: ReactNode; more?: number; label?: string }) {
  return (
    <span className="errands-stack" role={label ? "img" : undefined} aria-label={label}>
      {children}
      {more > 0 ? <span className="errands-stack-more nums">+{more}</span> : null}
    </span>
  );
}

/**
 * The rows that came after the list did — a request arriving by Realtime: they get a moment of
 * the accent as they rise into place, the rows of the first read only rise. `ready` — the list's
 * first read has come.
 */
export function useArrivals(ids: readonly string[], ready: boolean): ReadonlySet<string> {
  const known = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const key = ids.join(",");
  useEffect(() => {
    if (!ready) return;
    const list = key ? key.split(",") : [];
    if (!known.current) {
      known.current = new Set(list);
      return;
    }
    const seen = known.current;
    const added = list.filter((id) => !seen.has(id));
    for (const id of list) seen.add(id);
    if (added.length === 0) return;
    // a new arrival is news for a moment only: the attribute goes once its glow has played
    setFresh((was) => new Set([...was, ...added]));
    setTimeout(() => setFresh((was) => new Set([...was].filter((id) => !added.includes(id)))), ARRIVAL_MS);
  }, [key, ready]);
  return fresh;
}
const ARRIVAL_MS = 1_600;

/** The alarm's icon, ringing. */
export function AlarmGlyph({ size = 16 }: { size?: number }) {
  return (
    <span aria-hidden className="errands-siren">
      <Siren size={size} strokeWidth={2.25} />
    </span>
  );
}
