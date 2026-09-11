import type { BriefLine } from "@/lib/pulse/briefing";
import type { Progress } from "./useTypewriter";

/**
 * What the assistant has already said in this tab session, with how much of it was
 * typed: coming back to Пульс from another tab shows the conversation at once and
 * types only what is new. Lives for the page's lifetime (a reload starts over).
 */
export const conversation: { spoken: BriefLine[]; shown: Progress } = { spoken: [], shown: {} };

export function forgetConversation(): void {
  conversation.spoken = [];
  conversation.shown = {};
}
