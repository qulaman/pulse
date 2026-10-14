import { useMemo } from "react";

import { Ecc, QrCode as Encoder } from "@/lib/vendor/qrcodegen";

/** Quiet zone of the QR standard: four modules of white around the symbol. */
const BORDER = 4;

/**
 * A QR as one SVG path — crisp at any size and in a screenshot (D-135). Black on white
 * whatever the theme: phone cameras read dark modules on a light field. Medium error
 * correction holds through a glare on a monitor.
 */
export function QrCode({ text, size = 184, label }: { text: string; size?: number; label: string }) {
  const { dim, path } = useMemo(() => {
    const qr = Encoder.encodeText(text, Ecc.MEDIUM);
    let d = "";
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.getModule(x, y)) d += `M${x + BORDER} ${y + BORDER}h1v1h-1z`;
      }
    }
    return { dim: qr.size + BORDER * 2, path: d };
  }, [text]);

  return (
    <svg
      viewBox={`0 0 ${dim} ${dim}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      className="shrink-0 rounded-[12px]"
      data-testid="qr"
    >
      <rect width={dim} height={dim} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
