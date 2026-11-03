"use client";

import { useEffect, useState } from "react";

import { frameSize, isVectorLogo, stillFrame } from "@/lib/ui/stillLogo";

/**
 * The client's logo as a still frame (D-155 §6, В-9): the file is drawn once on a canvas and the
 * screen shows that PNG, so nothing animated inside it (SMIL, CSS, an animated WebP or PNG) keeps
 * the main thread busy. The file in the bucket stays as uploaded. The first render — on the server
 * and on the client alike — is an empty span with the same classes (no #418); the frame comes in
 * the effect, from the cache when this logo was already shown. Any failure shows the file as before.
 */
export function StillLogo({ src, className, alt }: { src: string; className?: string; alt?: string }) {
  const [shown, setShown] = useState<{ src: string; url: string } | null>(null);

  useEffect(() => {
    let live = true;
    void stillFrame(src, snapshot).then((frame) => {
      if (live) setShown({ src, url: frame ?? src });
    });
    return () => {
      live = false;
    };
  }, [src]);

  if (shown?.src !== src) return <span aria-hidden className={className} />;
  // eslint-disable-next-line @next/next/no-img-element -- client logo from the public bucket
  return <img src={shown.url} alt={alt ?? ""} className={className} />;
}

/** One draw of `src` on a canvas → a blob: address of the PNG; rejects with the reason it could not. */
function snapshot(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onerror = () => reject(new Error("the file did not load"));
    image.onload = () => {
      const size = frameSize(image.naturalWidth, image.naturalHeight, isVectorLogo(src));
      if (!size) return reject(new Error("the file has no size"));
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("no 2d canvas"));
      try {
        context.drawImage(image, 0, 0, size.width, size.height);
        // a file served without CORS taints the canvas: toBlob throws SecurityError
        canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("an empty frame"))), "image/png");
      } catch (error) {
        reject(error);
      }
    };
    image.src = src;
  });
}
