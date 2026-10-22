import type { CardKind, Mark, MarkTone } from "@/components/lab/pitch/parts";

/**
 * «Технология» (/lab/tech): the voice pipeline as a system map. Every node is a real piece of
 * the code, every panel quotes the real shape of what passes through it — the paths, function
 * names and formats of docs/AI.md and docs/BACKEND.md as of 2026-10-22. People and phrases are
 * made up; nothing here reads data.
 */

export type Lane = "director" | "cloud" | "employee";

export type NodeKey =
  | "record"
  | "vault"
  | "stt"
  | "guard"
  | "parse"
  | "resolve"
  | "board"
  | "commit"
  | "outbox"
  | "notify"
  | "accept"
  | "live";

/** The map, top to bottom: one row per node, in the order the happy path visits them. */
export const NODES: { key: NodeKey; lane: Lane; title: string; tech: string }[] = [
  { key: "record", lane: "director", title: "Запись", tech: "MediaRecorder · IndexedDB" },
  { key: "vault", lane: "cloud", title: "Сейф", tech: "Supabase Storage" },
  { key: "stt", lane: "cloud", title: "Распознавание", tech: "gpt-4o-transcribe" },
  { key: "guard", lane: "cloud", title: "Сторож", tech: "lib/ai/stt-guard.ts" },
  { key: "parse", lane: "cloud", title: "Разбор", tech: "claude-haiku-4-5" },
  { key: "resolve", lane: "cloud", title: "Время и имена", tech: "TimeRef · matchName" },
  { key: "board", lane: "director", title: "Карточки", tech: "доска Пульса" },
  { key: "commit", lane: "cloud", title: "Транзакция", tech: "confirm_voice_batch" },
  { key: "outbox", lane: "cloud", title: "Доставка", tech: "notification_deliveries" },
  { key: "notify", lane: "employee", title: "Уведомление", tech: "Web Push · sw.js" },
  { key: "accept", lane: "employee", title: "Принял", tech: "transition_task" },
  { key: "live", lane: "director", title: "Пульс и ТВ", tech: "Realtime" },
];

export type Tone = "accent" | "ok" | "warn" | "danger";

export type CardSpec = { kind: CardKind; who: string; badge?: string; title: string; when: string | null; mark?: Mark };

export type Panel =
  | { type: "quote"; label: string; text: string }
  /** monospace lines; `--` and `//` start a comment, `←` marks what came back */
  | { type: "code"; label: string; lines: string[] }
  | { type: "checks"; label: string; items: { text: string; ok: boolean; note?: string }[] }
  /** what came in → what it became */
  | { type: "turns"; label: string; items: { from: string; to: string; tone: MarkTone | "danger"; note: string }[] }
  | { type: "cards"; label: string; items: CardSpec[] }
  | { type: "push"; title: string; body: string }
  | { type: "buttons" };

export type Step = {
  node: NodeKey;
  /** the colour of this visit; accent when omitted */
  tone?: Tone;
  ms: number;
  title: string;
  note: string;
  panels: Panel[];
  /** where the recording is — carried forward until a later step says otherwise */
  audio?: Mark;
  /** the receipt the director sees — carried forward the same way */
  receipt?: Mark;
};

export type Script = { key: string; label: string; summary: string; steps: Step[] };

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                               */
/* -------------------------------------------------------------------------- */

const ON_PHONE: Mark = { tone: "accent", text: "на телефоне" };
const IN_VAULT: Mark = { tone: "ok", text: "в сейфе" };
const NO_RECEIPT: Mark = { tone: "muted", text: "ещё нет" };

const PHRASE =
  "Марат, коммерческое предложение по объекту на Абая — к пятнице, в шесть вечера. Айгуль, завтра до обеда созвонись с банком. Всем: с понедельника парковка только во дворе.";

const TRANSCRIPT_LINES = [
  "← text «Марат, коммерческое предложение по объекту на Абая",
  "        к пятнице в шесть вечера. Айгуль, завтра до обеда",
  "        созвонись с банком. Всем: с понедельника парковка",
  "        только во дворе.»",
];

const PROMPT_LINES = [
  "model   gpt-4o-transcribe",
  "prompt  «Директор диктует поручения сотрудникам. В компании",
  "         работают Марат Ахметов, Айгуль Касымова, Ерлан Сапаров…;",
  "         коротко их зовут…» -- предложение, а не список: так нет эха",
];

const record = (title: string, note: string, quote: string, extra: string[] = []): Step => ({
  node: "record",
  ms: 3600,
  title,
  note,
  audio: ON_PHONE,
  receipt: NO_RECEIPT,
  panels: [
    { type: "quote", label: "Голос директора", text: quote },
    {
      type: "code",
      label: "На телефоне",
      lines: [
        "MediaRecorder  audio/mp4 (iPhone) · audio/webm (Android)",
        "IndexedDB      запись лежит до загрузки",
        "client_request_id  7f3c…e21a  -- один ключ на весь путь",
        ...extra,
      ],
    },
  ],
});

const vault = (ext = "m4a"): Step => ({
  node: "vault",
  tone: "ok",
  ms: 3000,
  title: "Сначала — в сейф",
  note: "Сервер выдаёт одноразовую ссылку, и телефон кладёт запись прямо в хранилище — раньше, чем её услышит ИИ. Что бы ни сломалось дальше, голосовое цело и его можно переслушать.",
  audio: IN_VAULT,
  panels: [
    {
      type: "code",
      label: "Загрузка",
      lines: [
        `POST /api/voice/upload-url  { ext: "${ext}", client_request_id }`,
        "← { signed_url, audio_path }",
        `PUT  voice/{company_id}/{user_id}/7f3c…e21a.${ext}`,
        "inbox_items.status = recorded  -- черновик голосового заведён",
      ],
    },
  ],
});

const stt: Step = {
  node: "stt",
  ms: 3600,
  title: "Распознаю речь",
  note: "Модели распознавания заранее подсказаны имена команды — до 60 самых адресуемых людей — и слова компании. Поэтому казахские имена и названия объектов пишутся правильно.",
  panels: [{ type: "code", label: "Запрос и ответ", lines: [...PROMPT_LINES, ...TRANSCRIPT_LINES] }],
};

const guardPass: Step = {
  node: "guard",
  tone: "ok",
  ms: 3000,
  title: "Проверяю, что это речь",
  note: "На тишине и шуме модели распознавания сочиняют связный текст. Сторож отбрасывает такое до разбора — иначе мусор стал бы поручением или объявлением всем.",
  panels: [
    {
      type: "checks",
      label: "Шесть проверок",
      items: [
        { text: "Запись не короче секунды", ok: true, note: "10 с" },
        { text: "Не фраза-фантом («Спасибо за просмотр»)", ok: true },
        { text: "Больше одного слова", ok: true, note: "26" },
        { text: "Не эхо подсказки с именами", ok: true },
        { text: "Нет зацикливания", ok: true },
        { text: "Не больше 30 знаков в секунду", ok: true, note: "≈17" },
      ],
    },
  ],
};

const parse: Step = {
  node: "parse",
  ms: 4600,
  title: "Понимаю смысл",
  note: "Claude разбирает поток на отдельные дела. Ответ строго по JSON-схеме: схема компилируется в грамматику, и модель не может вернуть кривую форму. Время модель не считает — только называет, что услышала.",
  panels: [
    {
      type: "code",
      label: "claude-haiku-4-5 · structured outputs · ростер в кэше",
      lines: [
        '{ "entities": [',
        '  { "kind": "task",',
        '    "assignee_name": "Марат Ахметов",',
        '    "assignee_confidence": 0.97,',
        '    "title": "Коммерческое предложение по объекту на Абая",',
        '    "deadline": { "text": "к пятнице, в шесть вечера",',
        '      "day": "weekday", "weekday": 5, "time": "18:00",',
        '      "part": "evening", "confidence": 0.95 }, … },',
        '  { "kind": "task", "assignee_name": "Айгуль Касымова",',
        '    "title": "Созвониться с банком",',
        '    "deadline": { "day": "tomorrow", "part": "before_lunch", … } },',
        '  { "kind": "announcement",',
        '    "text": "С понедельника парковка только во дворе" }',
        "] }",
      ],
    },
  ],
};

const resolve: Step = {
  node: "resolve",
  ms: 4400,
  title: "Время считает код, человека выбирает сервер",
  note: "Арифметика дат — единственное, в чём модель ошибалась систематически, поэтому её делает код по часам Актобе и правилам компании. Имя от модели сверяется со списком команды, id ставит сервер.",
  panels: [
    {
      type: "turns",
      label: "Сейчас: четверг, 22.10.2026, 9:12",
      items: [
        { from: "«к пятнице, в шесть вечера»", to: "пт 23.10, 18:00", tone: "ok", note: "время названо — уверенно" },
        { from: "«завтра до обеда»", to: "пт 23.10, 13:00", tone: "warn", note: "«до обеда» = 13:00 по правилам компании · уверенность 0,7 → жёлтый чип" },
        { from: "Марат Ахметов", to: "id 3b9e…", tone: "ok", note: "имя из списка команды дословно" },
        { from: "Айгуль Касымова", to: "id a41c…", tone: "ok", note: "имя из списка команды дословно" },
      ],
    },
  ],
};

const CARDS: CardSpec[] = [
  { kind: "task", who: "Марат", title: "Коммерческое предложение по объекту на Абая", when: "пт, 18:00" },
  { kind: "task", who: "Айгуль", title: "Созвониться с банком", when: "завтра, 13:00", mark: { tone: "warn", text: "«до обеда» — это 13:00?" } },
  { kind: "announcement", who: "Всем", badge: "все", title: "С понедельника парковка только во дворе", when: "сразу" },
];

const board: Step = {
  node: "board",
  ms: 4400,
  title: "Директор смотрит и бросает",
  note: "Карточки встают на доску Пульса. Жёлтый чип просит взгляда, а не действия. Автоотправки задач нет: тап по лицу — и полетело.",
  panels: [{ type: "cards", label: "Доска Пульса", items: CARDS }],
};

const commit: Step = {
  node: "commit",
  ms: 4200,
  title: "Одна транзакция на всё",
  note: "Все дела фразы записываются разом — или ни одно. Повтор с тем же ключом вернёт прошлый ответ, а не создаст вторую задачу. Каждая строка помечена компанией.",
  panels: [
    {
      type: "code",
      label: "Postgres",
      lines: [
        "rpc confirm_voice_batch(payload, client_request_id)  -- security definer",
        "insert into ingest_batches … on conflict do nothing  -- повтор → тот же ответ",
        "insert into tasks (company_id, assignee_id, deadline, …)  -- × 2",
        "insert into announcements (company_id, text)  -- × 1",
        "-- триггеры, а не HTTP из транзакции:",
        "insert into notification_deliveries (event_kind, status)  -- queued",
        "update ai_logs set confirmed_entities, was_edited  -- учимся на правках",
      ],
    },
  ],
};

const outbox: Step = {
  node: "outbox",
  ms: 3600,
  title: "Очередь доставки",
  note: "Воркер забирает строки так, что два воркера никогда не отправят один пуш дважды. Окно доставки компании — 08:00–21:00; сейчас 9:12, поэтому сразу.",
  receipt: { tone: "muted", text: "отправлено 9:12" },
  panels: [
    {
      type: "code",
      label: "Воркер",
      lines: [
        "rpc claim_deliveries(50)  -- for update skip locked",
        "web-push → Apple / Google  -- VAPID, urgency: high, ttl 24 ч",
        "status: queued → sent",
        "sent_at 09:12:04",
      ],
    },
  ],
};

const notify: Step = {
  node: "notify",
  ms: 4200,
  title: "Телефон сотрудника",
  note: "Сервис-воркер показывает уведомление и сам сообщает серверу, что оно показано. Push-сервисы доставку не подтверждают, поэтому директор видит факт: «увидел» — или «не открывал с 9:12».",
  receipt: { tone: "accent", text: "увидел 9:14" },
  panels: [
    { type: "push", title: "Новая задача · Серик", body: "Коммерческое предложение по объекту на Абая" },
    { type: "code", label: "Квитанция", lines: ["POST /api/push/seen  { delivery_id }", "← seen_at 09:14"] },
  ],
};

const accept: Step = {
  node: "accept",
  tone: "ok",
  ms: 3600,
  title: "Принял — одной кнопкой",
  note: "У сотрудника максимум три кнопки. «Принял» работает и прямо из шторки уведомления — приложение можно не открывать.",
  receipt: { tone: "ok", text: "принял 9:15" },
  panels: [
    { type: "buttons" },
    {
      type: "code",
      label: "Переход статуса",
      lines: [
        "POST /api/tasks/:id/transition  { to_status: \"accepted\", client_request_id }",
        "rpc transition_task  -- sent → accepted",
        "notification_deliveries.acted_at 09:15  -- «принял»",
      ],
    },
  ],
};

const live: Step = {
  node: "live",
  tone: "ok",
  ms: 4400,
  title: "Пульс и стена — сами",
  note: "Изменение в базе прилетает на все экраны через Realtime и под теми же правилами доступа. Директор ничего не обновляет и никого не переспрашивает.",
  panels: [
    {
      type: "cards",
      label: "Пульс директора",
      items: [{ ...CARDS[0], mark: { tone: "ok", text: "принял 9:15" } }],
    },
    {
      type: "code",
      label: "Realtime",
      lines: ["postgres_changes  tasks UPDATE  -- под RLS", "→ useRealtimeQuery → кэш TanStack Query", "→ карточка и стена в кабинете, без перезагрузки"],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Scripts                                                                     */
/* -------------------------------------------------------------------------- */

const MAIN: Script = {
  key: "main",
  label: "Обычный путь",
  summary: "Одна фраза — три дела у трёх адресатов и квитанция «отправлено → увидел → принял».",
  steps: [
    record(
      "Директор говорит",
      "Зажал лицо на Пульсе и надиктовал три дела подряд. Запись сразу пишется в память телефона: закрытое приложение или пропавшая сеть её не потеряют.",
      PHRASE,
    ),
    vault(),
    stt,
    guardPass,
    parse,
    resolve,
    board,
    commit,
    outbox,
    notify,
    accept,
    live,
  ],
};

const OFFLINE: Script = {
  key: "offline",
  label: "Нет сети",
  summary: "Связь пропадает дважды — запись не теряется, а задача создаётся ровно один раз.",
  steps: [
    record(
      "Директор говорит в лифте",
      "Связи нет, но запись идёт как обычно и лежит в памяти телефона.",
      "Марат, коммерческое предложение по объекту на Абая — к пятнице, в шесть вечера.",
    ),
    {
      node: "vault",
      tone: "warn",
      ms: 3800,
      title: "Сеть пропала",
      note: "Загрузка не прошла. Лицо говорит: «Нет связи. Запись сохранил — разберу, как появится сеть». Приложение можно закрыть.",
      audio: { tone: "warn", text: "на телефоне, ждёт сети" },
      panels: [{ type: "code", label: "Загрузка", lines: ["PUT voice/…/7f3c…e21a.m4a  ✕ нет сети", "стадия: kept  -- запись и ключ — в IndexedDB"] }],
    },
    {
      node: "vault",
      tone: "ok",
      ms: 3400,
      title: "Сеть вернулась — повтор с того же шага",
      note: "Телефон сам повторяет загрузку под тем же ключом. Если прошлая попытка на самом деле дошла, сервер это узнает и не заведёт второй черновик.",
      audio: IN_VAULT,
      panels: [
        {
          type: "code",
          label: "Повтор",
          lines: ["POST /api/voice/upload-url  { client_request_id: 7f3c…e21a }  -- тот же ключ", "PUT voice/…/7f3c…e21a.m4a  ✓"],
        },
      ],
    },
    { ...stt, ms: 2200 },
    { ...parse, ms: 2600, panels: [{ type: "code", label: "Разбор", lines: ['{ "entities": [ { "kind": "task", "assignee_name": "Марат Ахметов", … } ] }'] }] },
    {
      node: "board",
      tone: "warn",
      ms: 3600,
      title: "Бросок — и снова без связи",
      note: "Директор бросил карточку там, где сети нет. Лицо: «Нет связи. Отправлю, как появится». Пачка ждёт на телефоне и уйдёт сама.",
      panels: [{ type: "cards", label: "Доска Пульса", items: [{ ...CARDS[0], mark: { tone: "warn", text: "отправлю, как появится сеть" } }] }],
    },
    {
      node: "commit",
      ms: 3400,
      title: "Запрос дошёл, ответ — нет",
      note: "Самый коварный случай: база задачу записала, а ответ потерялся по дороге. Телефон думает, что ничего не ушло.",
      panels: [
        {
          type: "code",
          label: "Postgres",
          lines: ["rpc confirm_voice_batch(payload, 9d21…)  ✓ задача записана", "← ответ  ✕ потерян в сети"],
        },
      ],
    },
    {
      node: "board",
      tone: "warn",
      ms: 2600,
      title: "Телефон пробует ещё раз",
      note: "Тот же бросок уходит повторно — с тем же ключом 9d21…",
      panels: [{ type: "cards", label: "Доска Пульса", items: [{ ...CARDS[0], mark: { tone: "warn", text: "отправляю ещё раз…" } }] }],
    },
    {
      node: "commit",
      tone: "ok",
      ms: 4000,
      title: "Ключ узнан — дубля нет",
      note: "База видит ключ, который уже был, и возвращает прошлый ответ. Вторая задача не создаётся, Марат не получит два одинаковых уведомления.",
      panels: [
        {
          type: "code",
          label: "Postgres",
          lines: [
            "insert into ingest_batches (client_request_id: 9d21…)",
            "  on conflict do nothing  -- такой ключ уже был",
            "← { result: <прошлый ответ>, duplicate: true }",
          ],
        },
      ],
    },
    {
      ...outbox,
      tone: "ok",
      title: "Ровно одно уведомление",
      note: "В очереди одна строка на Марата — её и отправит воркер.",
    },
  ],
};

const STT_DOWN: Script = {
  key: "stt",
  label: "Сбой распознавания",
  summary: "Модель распознавания не ответила — запись уже в сейфе, повтор без перезаписи.",
  steps: [
    record("Директор говорит", "Обычная запись — ничего особенного.", "Айгуль, завтра до обеда созвонись с банком."),
    vault(),
    {
      node: "stt",
      tone: "warn",
      ms: 3600,
      title: "Модель молчит",
      note: "Основной провайдер не ответил за 10 секунд. Голосовое не пострадало: оно в сейфе с прошлого шага.",
      panels: [{ type: "code", label: "Распознавание", lines: ["gpt-4o-transcribe  ✕ timeout 10 с"] }],
    },
    {
      node: "stt",
      ms: 3000,
      title: "Пауза — и повтор",
      note: "Политика ретраев: запасной провайдер, если компания его включила, потом пауза в секунду и ещё одна попытка основного.",
      panels: [
        {
          type: "code",
          label: "Политика ретраев",
          lines: [
            "основной   10 с  ✕",
            "запасной   10 с  -- если включён в настройках",
            "пауза      1 с",
            "основной   ещё раз",
          ],
        },
      ],
    },
    {
      node: "stt",
      tone: "ok",
      ms: 3200,
      title: "Со второго раза",
      note: "Текст пришёл, разбор идёт дальше. Если бы не помог и повтор, директор увидел бы «Не расслышал. Аудио сохранил — повторить?» — и повторил бы без перезаписи, по файлу из сейфа.",
      panels: [{ type: "code", label: "Ответ", lines: ["← text «Айгуль, завтра до обеда созвонись с банком.»"] }],
    },
    { ...guardPass, ms: 2400 },
    {
      ...parse,
      ms: 3000,
      tone: "ok",
      title: "Дальше — обычный путь",
      note: "Разбор, карточка, бросок. Директор заметил только чуть более долгую паузу.",
      panels: [{ type: "code", label: "Разбор", lines: ['{ "entities": [ { "kind": "task", "assignee_name": "Айгуль Касымова", … } ] }'] }],
    },
  ],
};

const NOISE: Script = {
  key: "noise",
  label: "Шум вместо речи",
  summary: "Запись из кармана: модель сочинила текст, сторож его отбросил, Claude даже не вызывался.",
  steps: [
    record(
      "Запись из кармана",
      "Четыре секунды уличного шума — лицо зажалось случайно.",
      "…шум улицы, речи нет…",
      ["длина  0:04"],
    ),
    vault(),
    {
      node: "stt",
      tone: "warn",
      ms: 3800,
      title: "Модель сочинила текст",
      note: "На шуме модель распознавания продолжает подсказку вместо расшифровки — возвращает список имён. Самый опасный класс: имена настоящие, и по ним можно «назначить» задачу.",
      panels: [{ type: "code", label: "Ответ", lines: ["← text «В компании работают Марат Ахметов, Айгуль Касымова,", "        Ерлан Сапаров.»  -- эхо подсказки, а не речь"] }],
    },
    {
      node: "guard",
      tone: "danger",
      ms: 4400,
      title: "Сторож отбросил",
      note: "Четыре слова подряд из подсказки — это эхо, а не речь. Разбор не запускается, токены не тратятся.",
      panels: [
        {
          type: "checks",
          label: "Проверки",
          items: [
            { text: "Запись не короче секунды", ok: true, note: "4 с" },
            { text: "Не фраза-фантом", ok: true },
            { text: "Больше одного слова", ok: true },
            { text: "Не эхо подсказки с именами", ok: false, note: "prompt_echo" },
          ],
        },
      ],
    },
    {
      node: "board",
      tone: "ok",
      ms: 4000,
      title: "Директору — честный ответ",
      note: "Лицо говорит «Не понял, повторить?». Без сторожа эта запись стала бы объявлением всем или задачей случайному человеку.",
      panels: [
        {
          type: "code",
          label: "Что осталось",
          lines: ["← { transcript: null, code: \"empty_transcript\" }", "ai_logs.status = error:stt_guard:prompt_echo", "запись — в сейфе, её можно переслушать"],
        },
      ],
    },
  ],
};

const NAMESAKES: Script = {
  key: "namesakes",
  label: "Тёзки",
  summary: "Два Ерлана в команде: модель уверена, но выбирает директор — ошибочный адресат недопустим.",
  steps: [
    record("Директор говорит", "Имя без фамилии — так говорят все.", "Ерлану скажи — пусть завтра привезёт образцы."),
    { ...vault(), ms: 1800 },
    { ...stt, ms: 1800, panels: [{ type: "code", label: "Ответ", lines: ["← text «Ерлану скажи, пусть завтра привезёт образцы.»"] }] },
    {
      node: "parse",
      ms: 3400,
      title: "Модель уверена",
      note: "Модель выбрала одного из Ерланов — уверенно. Но уверенность модели здесь ничего не решает.",
      panels: [
        {
          type: "code",
          label: "claude-haiku-4-5",
          lines: ['{ "kind": "task",', '  "assignee_queries": ["Ерлану"],', '  "assignee_name": "Ерлан Сапаров",', '  "assignee_confidence": 0.9,', '  "title": "Привезти образцы", … }'],
        },
      ],
    },
    {
      node: "resolve",
      tone: "warn",
      ms: 4600,
      title: "Два Ерлана в команде",
      note: "Упоминание — одно слово без фамилии, и его основа совпала с именем у двоих. Сервер не угадывает, а спрашивает — даже если модель уверена.",
      panels: [
        {
          type: "turns",
          label: "matchName",
          items: [
            { from: "«Ерлану»", to: "основа «ерлан»", tone: "muted", note: "падеж снят: -у" },
            { from: "«ерлан»", to: "Ерлан Сапаров", tone: "warn", note: "совпадение" },
            { from: "«ерлан»", to: "Ерлан Нурланов", tone: "warn", note: "совпадение" },
          ],
        },
      ],
    },
    {
      node: "board",
      ms: 4000,
      title: "Выбор одним тапом",
      note: "На карточке — чип с двумя кандидатами. Ошибочный адресат — единственная недопустимая ошибка, поэтому здесь нужен взгляд директора.",
      panels: [
        {
          type: "cards",
          label: "Доска Пульса",
          items: [{ kind: "task", who: "Кому? Ерлан С. · Ерлан Н.", badge: "?", title: "Привезти образцы", when: "завтра, 18:00", mark: { tone: "warn", text: "выберите исполнителя" } }],
        },
      ],
    },
    {
      ...commit,
      tone: "ok",
      ms: 3200,
      title: "Ушло нужному Ерлану",
      note: "Директор тапнул «Ерлан Н.» — задача записана ему, id поставил сервер.",
      panels: [{ type: "code", label: "Postgres", lines: ["insert into tasks (assignee_id: 8c02… -- Ерлан Нурланов)"] }],
    },
  ],
};

const NIGHT: Script = {
  key: "night",
  label: "Ночью",
  summary: "Поручение в 22:40 не будит сотрудника: задача ждёт окна доставки и уходит в 8:00.",
  steps: [
    record("22:40, директор дома", "Вспомнил вечером — сказал сразу, пока не забыл.", "Марат, смету по Абая — завтра к двенадцати."),
    { ...vault(), ms: 1800 },
    {
      ...parse,
      ms: 2800,
      panels: [
        {
          type: "code",
          label: "claude-haiku-4-5",
          lines: ['{ "kind": "task", "assignee_name": "Марат Ахметов",', '  "title": "Смета по Абая",', '  "deadline": { "day": "tomorrow", "time": "12:00", … } }'],
        },
      ],
    },
    {
      ...board,
      ms: 2800,
      panels: [{ type: "cards", label: "Доска Пульса", items: [{ kind: "task", who: "Марат", title: "Смета по Абая", when: "завтра, 12:00" }] }],
    },
    {
      node: "commit",
      ms: 4600,
      title: "Вне окна доставки",
      note: "Окно компании — 08:00–21:00. Задача записывается отложенной: Марат её пока не видит, правило доступа показывает отложенную только автору. Если срочно — «Отправить» на её карточке в «Задачах».",
      receipt: { tone: "muted", text: "ждёт 8:00" },
      panels: [
        {
          type: "code",
          label: "Postgres",
          lines: ["22:40 — вне окна 08:00–21:00", "tasks.status = scheduled", "scheduled_send_at = 08:00  -- открытие окна"],
        },
      ],
    },
    {
      node: "outbox",
      ms: 4000,
      title: "8:00 — тик выпускает",
      note: "Утром тик переводит задачу в «отправлена», и только тогда в очередь встаёт уведомление.",
      receipt: { tone: "muted", text: "отправлено 8:00" },
      panels: [
        {
          type: "code",
          label: "Тик",
          lines: ["publish_due_scheduled()  -- scheduled → sent", "notification_deliveries  queued → sent 08:00"],
        },
      ],
    },
    {
      ...notify,
      tone: "ok",
      title: "Утром — уведомление",
      note: "Марат видит задачу за кофе, а не в полночь.",
      receipt: { tone: "accent", text: "увидел 8:03" },
      panels: [
        { type: "push", title: "Новая задача · Серик", body: "Смета по Абая" },
        { type: "code", label: "Квитанция", lines: ["POST /api/push/seen  { delivery_id }", "← seen_at 08:03"] },
      ],
    },
  ],
};

export const SCRIPTS: Script[] = [MAIN, OFFLINE, STT_DOWN, NOISE, NAMESAKES, NIGHT];
