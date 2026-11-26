import type { MascotState } from "@/components/brand/Mascot";

/**
 * Which face the director's Пульс shows, by weight (D-60, D-65, D-82, D-178):
 * the phrase in hand and the celebration after its throw over everything; a request the
 * secretary has just finished (awake, the eye on the secretary — D-210); a failure (its act plays over the job or the mood); «не разобрал»; then the open card's
 * job — a thought or a news act that comes while a card is open does not take the job out of the
 * face's hands (the bubble still shows); then the news itself; then rest or awake.
 */
export function directorMascot(scene: {
  /** sending, celebrating, offering or thinking while a phrase is in hand; null otherwise */
  confirm: MascotState | null;
  /** the small secretary has just finished a request: the face is awake and looks at it (D-210) */
  handoff: boolean;
  /** a failed phrase is up, or its act still plays */
  oops: boolean;
  /** the parse came back empty: the face waits, puzzled */
  unparsed: boolean;
  /** the job of the open card (D-82); null with no card open */
  job: MascotState | null;
  /** a thought is up */
  thought: boolean;
  /** the thought has an act of its own (a stamp, a crumpled card…) */
  newsAct: boolean;
  /** the watchful face of something waiting (D-70) */
  mood: MascotState | null;
  /** the waiting screen is up: `rest` is its face */
  idle: boolean;
  rest: MascotState;
  /** the face with the balls out */
  awake: MascotState;
}): MascotState {
  if (scene.confirm) return scene.confirm;
  if (scene.handoff) return "calm";
  if (scene.oops) return scene.job ?? scene.mood ?? "calm";
  if (scene.unparsed) return "thinking";
  if (scene.job) return scene.job;
  if (scene.thought) return scene.newsAct ? (scene.mood ?? "calm") : "processing";
  return scene.idle ? scene.rest : scene.awake;
}

/**
 * Which face the employee's Лента shows (D-110, D-178): the jump with confetti over everything;
 * then the open card's job — news from the director, a thought, does not take it out of the face's
 * hands; then the news (an awake face); then rest or awake.
 */
export function employeeMascot(scene: {
  cheering: boolean;
  /** the job of the open card; null with no card open */
  job: MascotState | null;
  thought: boolean;
  idle: boolean;
  /** the face at rest — what it carries, or neutral and awake until the board is read (D-178) */
  rest: MascotState;
  /** the face awake with nothing open: glad, worried, carrying */
  awake: MascotState;
  loading: boolean;
  speaking: boolean;
}): MascotState {
  if (scene.cheering) return "celebrating";
  if (scene.job) return scene.job;
  if (scene.thought) return scene.awake;
  if (scene.idle) return scene.rest;
  return scene.loading ? "thinking" : scene.speaking ? "speaking" : scene.awake;
}
