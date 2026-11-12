/**
 * «Чей ход» — contestant №3 (slug `own`). The thesis, written before the look and the motion.
 *
 * The director glances at the phone for two seconds between meetings and asks one thing: is the
 * ball on my side or theirs? Every one of the 21 functions is either a move that came back to
 * him (a report, a decline, a question, a visitor, a dispute) or a move he sends out (a task, an
 * announcement, points, an errand). So the screen is one vertical field ruled by one law —
 * altitude means whose move it is:
 *
 *   - the sky (top, out of the thumb's reach, read-only): the team. Free people float highest,
 *     people at work hang in the middle, light; whoever waits for the director's word turns dark
 *     and heavy and sinks onto the horizon, right above his thumb;
 *   - the horizon: the assistant's one line of words (greeting, «Понял так», answers) and the
 *     secretary's desk, which is literally the door between him and the company;
 *   - the ground (bottom, under the thumb): the director's side — what waits for him and the one
 *     key: hold to speak, tap the same spot to send.
 *
 * Motion carries the meaning: what he sends flies UP and lands on people; what needs him falls
 * DOWN. Clearing a move makes a person light again and they float back up into work — the
 * reward is watching the company lift. The face is gone: its five jobs each got a place (lever =
 * the key, barometer = the light over the horizon, stages = the key's ring, speech = the horizon
 * line, panels = the ground rising). The sky follows the delivery window: after 21:00 it is
 * night, and a phrase waits for the morning.
 */
export const CONCEPT = {
  slug: "own",
  name: "Чей ход",
  tagline:
    "Экран отвечает на один вопрос — чей сейчас ход: наверху команда в работе, а всё, что ждёт вашего слова, опускается к большому пальцу.",
  principles: [
    "Высота — это чей ход: свободные парят наверху, занятые — посередине, ждущие вашего слова темнеют и ложатся на кромку.",
    "Одна точка под пальцем: удержал — сказал, отпустил — проверил, тап в то же место — отправил.",
    "Слова — одной строкой на кромке, действие — одной клавишей; глубина поднимается снизу только по тапу.",
    "Движение несёт смысл: отправленное улетает вверх и садится на людей, ответы и новости опускаются к вам.",
    "Погода вместо лица: свет над кромкой — внимательно, спокойно или хорошо; красного и тревог нет.",
    "Небо живёт по окну доставки: после 21:00 наступает ночь, и фраза ждёт утра.",
  ],
  palette: ["#D6DFE6", "#EEF1F1", "#0F1215", "#1A1E22", "#D2F55C", "#F0A73C", "#A797FF", "#6FB1FF", "#5FD39A", "#0C1428"],
  type: "Onest — весь текст; Martian Mono (узкая ширина) — время, числа, таймеры и квитанции",
} as const;
