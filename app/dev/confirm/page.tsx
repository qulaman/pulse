"use client";

import { ConfirmScreen } from "@/components/confirm/ConfirmScreen";
import { Button } from "@/components/ui/Button";
import { IngestOverlay } from "@/components/voice/IngestOverlay";
import type { PostprocessedEntity } from "@/lib/ai/postprocess";
import { useIngestStore } from "@/lib/store/ingest";

/** Component sandbox: /confirm with no network, no session and no roster behind it. */

const ERLAN_ONE = "11111111-1111-1111-1111-111111111111";
const ERLAN_TWO = "22222222-2222-2222-2222-222222222222";
const MARAT = "33333333-3333-3333-3333-333333333333";

const FIXTURE: PostprocessedEntity[] = [
  {
    kind: "task",
    assignee_queries: ["Марат"],
    assignee_id: MARAT,

    assignee_name: null,
    assignee_confidence: 0.95,
    group_id: null,
    title: "Подготовить КП для Казхрома",
    body: null,
    deadline_iso: "2026-09-11T13:00:00+05:00",
    deadline_source_text: "завтра до обеда",
    deadline_confidence: 0.9,
    priority: "high",
    scheduled_send_at: null,
    source_span: "Марату подготовить КП для Казхрома завтра до обеда",
    assignee: {
      status: "matched",
      user_id: MARAT,
      candidates: [{ user_id: MARAT, full_name: "Марат Абдулов", score: 1 }],
      flag: "ok",
    },
  },
  {
    kind: "task",
    assignee_queries: ["Ерлан"],
    assignee_id: null,

    assignee_name: null,
    assignee_confidence: 0.5,
    group_id: null,
    title: "Съездить на объект в Актобе",
    body: null,
    deadline_iso: null,
    deadline_source_text: null,
    deadline_confidence: null,
    priority: "normal",
    scheduled_send_at: null,
    source_span: "Ерлану съездить на объект",
    assignee: {
      status: "ambiguous",
      user_id: null,
      candidates: [
        { user_id: ERLAN_ONE, full_name: "Ерлан Сатов", score: 0.82 },
        { user_id: ERLAN_TWO, full_name: "Ерлан Ким", score: 0.79 },
      ],
      flag: "check",
    },
    blocked: "assignee_unmatched",
  },
  {
    kind: "task",
    assignee_queries: ["Динара из Казхрома"],
    assignee_id: null,

    assignee_name: null,
    assignee_confidence: 0.1,
    group_id: null,
    title: "Согласовать смету по складу",
    body: null,
    deadline_iso: "2026-09-12T18:00:00+05:00",
    deadline_source_text: "к пятнице",
    deadline_confidence: 0.6,
    priority: "normal",
    scheduled_send_at: null,
    source_span: "Динаре согласовать смету",
    assignee: { status: "unmatched", user_id: null, candidates: [], flag: "check" },
    blocked: "assignee_unmatched",
  },
  {
    kind: "announcement",
    text: "В пятницу общий сбор в 10:00 в переговорной",
    source_span: "в пятницу общий сбор",
  },
  {
    kind: "points",
    assignee_queries: ["Марат"],
    assignee_id: MARAT,

    assignee_name: null,
    assignee_confidence: 0.95,
    amount: 10,
    reason: "за скорость по КП",
    source_span: "плюс десять Марату",
    assignee: {
      status: "matched",
      user_id: MARAT,
      candidates: [{ user_id: MARAT, full_name: "Марат Абдулов", score: 1 }],
      flag: "ok",
    },
  },
];

/** D-148: a repeating order and a weekly meeting, as «каждый понедельник …» comes back. */
const REPEATS: PostprocessedEntity[] = [
  {
    kind: "recurrence",
    assignee_queries: ["Марат"],
    assignee_id: MARAT,
    assignee_name: "Марат Абдулов",
    assignee_confidence: 0.95,
    title: "Отчёт по продажам",
    every: "week",
    interval: 1,
    weekdays: [1],
    month_day: 0,
    due_time: "18:00",
    source_span: "Каждый понедельник Марат отчёт по продажам",
    assignee: {
      status: "matched",
      user_id: MARAT,
      candidates: [{ user_id: MARAT, full_name: "Марат Абдулов", score: 1 }],
      flag: "ok",
    },
  },
  {
    kind: "event",
    title: "Планёрка",
    body: null,
    location: "в офисе",
    starts_at_iso: "2026-10-28T10:00:00+05:00",
    ends_at_iso: null,
    time_confidence: 0.95,
    time_source_text: "каждую среду в десять",
    participant_queries: [],
    participant_names: [],
    participant_ids: [],
    everyone: true,
    remind_before_min: null,
    repeat: "week",
    source_span: "каждую среду в десять планёрка, всем",
  },
];

export default function DevConfirmPage() {
  const loadFixture = () =>
    useIngestStore.setState({
      stage: "confirm",
      error: null,
      retryFrom: null,
      source: "voice",
      clientRequestId: crypto.randomUUID(),
      transcript:
        "Марату подготовить КП для Казхрома завтра до обеда, Ерлану съездить на объект, " +
        "Динаре согласовать смету к пятнице, в пятницу общий сбор, плюс десять Марату",
      entities: FIXTURE,
      parsedEntities: FIXTURE,
    });

  const loadRepeats = () =>
    useIngestStore.setState({
      stage: "confirm",
      error: null,
      retryFrom: null,
      source: "voice",
      clientRequestId: crypto.randomUUID(),
      transcript: "Каждый понедельник Марат отчёт по продажам, и каждую среду в десять планёрка, всем",
      entities: REPEATS,
      parsedEntities: REPEATS,
    });

  const showSttError = () =>
    useIngestStore.setState({
      stage: "error",
      error: { code: "stt_failed" },
      retryFrom: "transcribe",
      audioPath: "dev/fixture.webm",
      entities: [],
    });

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
        <Button variant="secondary" onClick={loadFixture}>
          Загрузить фикстуру
        </Button>
        <Button variant="secondary" onClick={loadRepeats}>
          Повторы
        </Button>
        <Button variant="secondary" onClick={showSttError}>
          Ошибка: stt_failed
        </Button>
        <Button variant="ghost" onClick={() => useIngestStore.getState().reset()}>
          Сброс
        </Button>
      </div>

      <ConfirmScreen sandbox />
      <IngestOverlay navigate={false} />
    </div>
  );
}
