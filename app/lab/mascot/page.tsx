import Link from "next/link";

import { MascotGallery } from "@/components/lab/MascotGallery";

/** The animation bench: every motion of «Капля» that exists, on one screen (D-45). */
export default function LabMascotPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <Link href="/lab" className="text-[13px] leading-4 text-muted">
        ‹ Лаборатория
      </Link>
      <h1 className="mt-2 text-[24px] font-bold leading-[30px]">Анимации маскота</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        Полка для проверки движения: состояния лица, жесты и сцены конвейера рядом, на одном размере и одном фоне
      </p>
      <div className="mt-4">
        <MascotGallery />
      </div>
    </main>
  );
}
