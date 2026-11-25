"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";

import { toast } from "@/components/ui/Toast";
import { accentClash, accentRefusal, APP_BG, clashWords, contrastRatio, MIN_ACCENT_CONTRAST, parseHex, savedClashWords } from "@/lib/brand-color";
import { useCompanyCard, useSaveCompanyCard, type CompanyCard } from "@/lib/desk/settings-queries";

export type BrandEdit = { name: string; tagline: string; accent: string };

/** «#2ed3b7», «2ED3B7» → «#2ED3B7»; empty → null (Pulse's own accent); unreadable → undefined. */
export function normalAccent(text: string): string | null | undefined {
  if (!text.trim()) return null;
  const rgb = parseHex(text);
  return rgb ? `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}` : undefined;
}

/**
 * What the accent readout says, and whether the accent will be honoured (≥ 4.5:1 on the app's
 * background). A brand colour never says a state (owner, 2026-11-25): a new one near green, amber or
 * red is refused (`danger`, the save says why); the one `stored` before the rule is honoured, with
 * a note (`clash`) until it is changed.
 */
export function accentVerdict(text: string, stored?: string | null): { text: string; tone: "muted" | "warn" | "ok" | "danger"; clash: boolean } {
  const hex = normalAccent(text);
  if (hex === null) return { text: "Без цвета остаётся фирменный акцент Pulse", tone: "muted", clash: false };
  if (hex === undefined) return { text: "Нужен hex вида #RRGGBB", tone: "warn", clash: false };
  const clash = accentClash(hex);
  if (clash && accentRefusal(hex, stored)) return { text: clashWords(clash), tone: "danger", clash: true };
  const ratio = contrastRatio(hex, APP_BG) ?? 0;
  if (ratio < MIN_ACCENT_CONTRAST) {
    return { text: `Контраст ${ratio.toFixed(1)}:1 — слишком тёмный, нужен не меньше ${MIN_ACCENT_CONTRAST}:1; останется акцент по умолчанию`, tone: "warn", clash: false };
  }
  if (clash) return { text: savedClashWords(clash), tone: "ok", clash: true };
  return { text: `Контраст с фоном ${ratio.toFixed(1)}:1 — подходит`, tone: "ok", clash: false };
}

const fromCard = (card: CompanyCard): BrandEdit => ({ name: card.name, tagline: card.brand.tagline ?? "", accent: card.brand.accent ?? "" });

type BrandDraft = {
  card: CompanyCard | undefined;
  failed: boolean;
  edit: BrandEdit | null;
  set: (patch: Partial<BrandEdit>) => void;
  reset: () => void;
  changed: { name: boolean; tagline: boolean; accent: boolean };
  dirty: boolean;
  /** Why the edits cannot be saved as they are; null — they can. */
  blocked: string | null;
  saving: boolean;
  save: () => Promise<boolean>;
};

const BrandContext = createContext<BrandDraft | null>(null);

/**
 * The company's name, tagline and accent being edited (D-44) — held by the settings' frame, so an
 * unsaved name survives a trip to «Словарь» and back, and the navigation's dot can show it. The
 * logo is not a draft: a file lands the moment it is chosen, as on the phone.
 */
export function BrandDraftProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const card = useCompanyCard();
  const saveCard = useSaveCompanyCard();
  const [edited, setEdited] = useState<BrandEdit | null>(null);

  const base = card.data ? fromCard(card.data) : null;
  const edit = edited ?? base;
  const changed = {
    name: Boolean(edit && base && edit.name.trim() !== base.name),
    tagline: Boolean(edit && base && edit.tagline.trim() !== base.tagline),
    accent: Boolean(edit && base && normalAccent(edit.accent) !== (normalAccent(base.accent) ?? null)),
  };
  const dirty = changed.name || changed.tagline || changed.accent;
  const blocked = !edit
    ? null
    : !edit.name.trim()
      ? "у компании должно быть название"
      : normalAccent(edit.accent) === undefined
        ? "цвет — hex вида #RRGGBB"
        : accentRefusal(normalAccent(edit.accent), base?.accent)
          ? "цвет компании похож на цвет состояния задачи"
          : null;

  const value: BrandDraft = {
    card: card.data,
    failed: card.isError,
    edit,
    set: (patch) => {
      if (edit) setEdited({ ...edit, ...patch });
    },
    reset: () => setEdited(null),
    changed,
    dirty,
    blocked,
    saving: saveCard.isPending,
    save: async () => {
      if (!edit || !dirty || blocked) return !dirty;
      try {
        await saveCard.mutateAsync({
          ...(changed.name ? { name: edit.name.trim() } : {}),
          brand: { tagline: edit.tagline.trim() || null, accent: normalAccent(edit.accent) ?? null },
        });
        setEdited(null);
        // the navigation's logo, the name and the accent are painted on the server: draw them again
        router.refresh();
        return true;
      } catch (error) {
        toast(error instanceof Error ? error.message : "Не получилось сохранить компанию");
        return false;
      }
    },
  };
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrandDraft(): BrandDraft {
  const draft = useContext(BrandContext);
  if (!draft) throw new Error("useBrandDraft outside BrandDraftProvider");
  return draft;
}
