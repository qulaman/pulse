import type { MascotSeason } from "@/lib/mascot/season";

/** Holiday colours: decoration, not a status, so not the status tokens (DESIGN §1.3). */
const HAT = "#d8453b";
const FUR = "#f3efe6";
const TULIP = "#e0484a";
const STEM = "#3fa36b";

/**
 * A holiday on the head (D-119), drawn in the face's 64-box over the crown and riding the body's
 * motion — «Капля» and the secretary alike (the secretary's is over the headset band). New Year:
 * a red hat whose tip flops to the right, a white band, a pompom. Наурыз: a spring tulip tucked in
 * at the left of the crown. Still — nothing here adds a frame of motion to the face.
 */
export function SeasonWear({ season }: { season: MascotSeason }) {
  if (season === "new_year") {
    return (
      <g data-prop="season" data-season="new_year">
        <path d="M18.5 6.5 Q21 -9 35 -13.5 Q44 -16 48 -9 Q42 -10.5 39 -6.5 Q40.5 0 43.5 6.5 Z" fill={HAT} />
        <path d="M22.5 1.5 Q25.5 -7.5 33 -10.8" fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="1.6" strokeLinecap="round" />
        <ellipse cx="31" cy="7" rx="14" ry="3.6" fill={FUR} />
        <circle cx="48" cy="-9" r="3.4" fill={FUR} />
      </g>
    );
  }
  return (
    <g data-prop="season" data-season="nauryz">
      <path d="M13.4 19 Q11.8 13 10.6 8.5" fill="none" stroke={STEM} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12.6 16 Q7.8 14.8 7.6 10.4 Q11.4 11.6 12.6 16 Z" fill={STEM} />
      <path d="M7 8.2 Q6.4 2.6 8.6 1.4 L10.4 4 L12.2 1.2 Q14.8 2.4 14 8.2 Q10.6 11 7 8.2 Z" fill={TULIP} />
      <path d="M9 7.6 Q10.4 3.4 12 7.2" fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="0.9" strokeLinecap="round" />
    </g>
  );
}
