/**
 * A person's face on the wall is only a real profile photo (D-185): with no photo the wall draws nothing,
 * no initials in a circle, no placeholder. The size is in `vh`, like everything on the wall. No frame, no shadow, no ring.
 */
export function TvAvatar({ src, size }: { src: string | null | undefined; /** Diameter in vh. */ size: number }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a profile photo from the public bucket
    <img
      src={src}
      alt=""
      className="shrink-0 rounded-full object-cover"
      style={{ width: `${size}vh`, height: `${size}vh`, background: "var(--surface)" }}
    />
  );
}
