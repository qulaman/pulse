"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { CompanyFormBone, SkeletonGroup } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { APP_BG, contrastRatio, DEFAULT_ACCENT, MIN_ACCENT_CONTRAST, parseHex } from "@/lib/brand-color";

const FIELD =
  "min-h-[44px] w-full rounded-[12px] border border-border bg-surface-2 px-3 text-[16px] leading-[22px] outline-none transition-colors duration-[120ms] focus:border-accent";

type Company = { name: string; brand: { logo_url: string | null; accent: string | null; tagline: string | null } };

async function readCompany(): Promise<Company> {
  const res = await fetch("/api/company", { credentials: "include" });
  if (!res.ok) throw new Error("company read failed");
  return (await res.json()) as Company;
}

/**
 * «О компании»: the name, a logo, a tagline and an optional accent (D-44 — the only
 * customisation a client gets). The accent is honoured only above 4.5:1 on the app
 * background; the readout says so before the director saves.
 */
export function CompanyForm() {
  const [company, setCompany] = useState<Company | null>(null);
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [accent, setAccent] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    readCompany()
      .then((data) => {
        if (cancelled) return;
        setCompany(data);
        setName(data.name);
        setTagline(data.brand.tagline ?? "");
        setAccent(data.brand.accent ?? "");
      })
      .catch(() => toast("Не удалось загрузить данные компании"));
    return () => {
      cancelled = true;
    };
  }, []);

  const ratio = accent ? contrastRatio(accent, APP_BG) : null;
  const accentOk = ratio !== null && ratio >= MIN_ACCENT_CONTRAST;
  const accentHex = parseHex(accent) ? `#${parseHex(accent)!.map((c) => c.toString(16).padStart(2, "0")).join("")}` : DEFAULT_ACCENT;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/company", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          brand: { tagline: tagline.trim() || null, accent: accent.trim() ? accentHex.toUpperCase() : null },
        }),
      });
      if (!res.ok) throw new Error("save failed");
      setCompany((await res.json()) as Company);
      toast("Сохранил компанию");
      // the header and the accent are painted on the server — a reload shows them
      window.location.reload();
    } catch {
      toast("Не получилось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/company/logo", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message_ru?: string } } | null;
        throw new Error(body?.error?.message_ru ?? "upload failed");
      }
      const { logo_url } = (await res.json()) as { logo_url: string };
      setCompany((c) => (c ? { ...c, brand: { ...c.brand, logo_url } } : c));
      toast("Логотип обновлён");
    } catch (error) {
      toast(error instanceof Error && error.message !== "upload failed" ? error.message : "Не удалось загрузить логотип");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removeLogo = async () => {
    const res = await fetch("/api/company", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ brand: { logo_url: null } }),
    });
    if (res.ok) {
      setCompany((c) => (c ? { ...c, brand: { ...c.brand, logo_url: null } } : c));
      toast("Логотип убран");
    } else toast("Не получилось убрать логотип");
  };

  if (!company) {
    return (
      <SkeletonGroup>
        <CompanyFormBone />
      </SkeletonGroup>
    );
  }

  return (
    <section className="rounded-[16px] border border-border bg-surface p-4">
      <h2 className="text-[19px] font-semibold leading-6">О компании</h2>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        Название и логотип видят все в шапке и на экране входа. Стиль Pulse остаётся, меняется только акцент
      </p>

      {/* header preview */}
      <div className="mt-4 flex items-center gap-3 rounded-[12px] border border-border bg-bg px-3 py-2">
        {company.brand.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- client logo from the public bucket
          <img src={company.brand.logo_url} alt="" className="h-7 max-w-[120px] object-contain" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-surface-2 text-[12px] font-semibold text-muted">
            {name.trim().slice(0, 1).toUpperCase() || "?"}
          </span>
        )}
        <span className="truncate text-[16px] font-semibold" style={{ color: accentOk ? accentHex : "var(--text)" }}>
          {name || "Название компании"}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] font-medium leading-[18px]">Название</span>
          <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="ТОО «Компания»" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] font-medium leading-[18px]">Подпись на экране входа</span>
          <input className={FIELD} value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={80} placeholder="Голосовое управление компанией" />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[14px] font-medium leading-[18px]">Логотип</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            aria-label="Файл логотипа"
            onChange={(e) => void upload(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? "Загружаю…" : company.brand.logo_url ? "Заменить" : "Загрузить"}
            </Button>
            {company.brand.logo_url ? (
              <Button variant="ghost" onClick={() => void removeLogo()}>
                Убрать
              </Button>
            ) : null}
          </div>
          <p className="text-[12px] leading-4 text-muted">PNG, JPEG, WebP или SVG до 2 МБ. Лучше горизонтальный, на тёмном фоне</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[14px] font-medium leading-[18px]">Акцентный цвет</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Выбрать цвет"
              className="h-11 w-14 cursor-pointer rounded-[10px] border border-border bg-surface-2 p-1"
              value={accentHex}
              onChange={(e) => setAccent(e.target.value)}
            />
            <input
              className={`${FIELD} nums`}
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              placeholder={`${DEFAULT_ACCENT} (по умолчанию)`}
              maxLength={7}
            />
            {accent ? (
              <Button variant="ghost" onClick={() => setAccent("")}>
                Сброс
              </Button>
            ) : null}
          </div>
          <p className="text-[12px] leading-4" style={{ color: accent && !accentOk ? "var(--warn)" : "var(--text-muted)" }}>
            {!accent
              ? "Без цвета остаётся фирменный акцент Pulse"
              : ratio === null
                ? "Нужен hex вида #RRGGBB"
                : accentOk
                  ? `Контраст с фоном ${ratio.toFixed(1)}:1 — подходит`
                  : `Контраст ${ratio.toFixed(1)}:1 — слишком тёмный, нужен не меньше ${MIN_ACCENT_CONTRAST}:1, останется акцент по умолчанию`}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <Button block disabled={saving || !name.trim()} onClick={() => void save()}>
          {saving ? "Сохраняю…" : "Сохранить компанию"}
        </Button>
      </div>
    </section>
  );
}
