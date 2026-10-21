import { z } from "zod";

import type { KindModule } from "./fields";

/**
 * The `announcement` kind (task 026): its section of the prompt, its few-shot pairs and its variant
 * of the model's schema. An announcement to everyone: news, a rule, general information.
 */

export const AnnouncementEntitySchema = z.strictObject({
  kind: z.literal("announcement"),
  text: z.string(),
  source_span: z.string(),
});

const section = `## announcement — объявление всем
Новость, правило, общая информация. Собрание или встреча с датой/временем — это event,
не announcement.`;

export const announcementKind: KindModule = {
  kind: "announcement",
  section,
  modelSchema: AnnouncementEntitySchema,
  examples: [],
};
