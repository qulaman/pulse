# tasks/012-notes.md — Заметки директора: захват голосом, приватная лента, «Поручить» и «Объявить» одной кнопкой

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропускать нельзя). Семантическое ревью сделает отдельная сессия. Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай.

> Источник: идея владельца (2026-09-17): «директор говорит ассистенту „запиши мысль…“, заметки видит только директор, отдельная страница правки и удаления, одной кнопкой заметку можно дать на исполнение сотруднику или отправить как сообщение». Анализ архитектора и решения — D-75. Этот файл — единственный текст наряда.

Наряд состоит из **трёх фаз = трёх сессий и веток**: A → B → C. Каждая фаза — отдельная запись в WORKLOG и отдельный отчёт; следующую фазу начинать только после приёмки предыдущей.

---

## 0. Решения, на которых стоит наряд (D-75; исполнителю — к сведению, не обсуждать)

1. **Заметка = своя сущность `note`** парсера и своя таблица `notes`. Таблица `reminders` не трогается; слияние напоминаний в заметки — открытый вопрос D-75, не в этом наряде.
2. **Приватность — по автору, не по роли**: RLS `user_id = auth.uid()`. Менеджер, второй директор, `tv`, сервисные страницы чужих заметок не видят.
3. **Захват без экрана подтверждения.** Если парсер вернул только заметки (одну или несколько) и ничего больше — они сохраняются сразу, /confirm не показывается, директор видит тост «Записал» с кнопкой «Отменить» (мягкое удаление). Смешанная фраза («запиши мысль про акцию и Марату позвонить Альфе») идёт на /confirm как обычно, заметка там — обычная карточка.
4. **Редактор — обычный `<textarea>` с автосохранением.** Никаких rich-text библиотек (стек D-39). Никаких тегов, папок, ревизий. Сырой транскрипт и аудио неизменны и хранятся рядом с правленым текстом.
5. **Конвертации не вызывают парсер.** «Поручить» и «Объявить» собирают сущность руками (как `startManual`) и ведут на существующий /confirm: там директор выбирает исполнителя и, если надо, срок. В payload подтверждения едет `note_id`; RPC помечает заметку конвертированной. Аудио заметки прикрепляется к задаче/объявлению (принцип 5).
6. **«Отправить как личное сообщение сотруднику» — НЕ в этом наряде**: примитива личного сообщения вне задачи в системе нет (открытый вопрос D-75 для владельца). В v1 две кнопки: «Поручить» и «Объявить».
7. **Удаление мягкое** (`deleted_at`), с «Отменить» в тосте. Удалённые не показываются нигде; физическая чистка — вместе с `db:clean`/`reset-demo`.
8. **Поиск** — фильтр по подстроке на клиенте по загруженной ленте (лимит 300 активных). Индекс `pg_trgm` — когда заметок станет больше тысячи, не сейчас.

---

## Контекст (читать только это, общий для всех фаз)

- `CLAUDE.md`: принципы 1, 5, 7; регламент п.4 (миграции), п.5 (evals при правке промпта), п.6 (время).
- `docs/AI.md` §3 (контракт сущностей) и §4 (few-shot) — только чтобы понять формат, не править.
- Код, который трогаем (читать по мере шагов, не заранее): `supabase/migrations/20260910140000_points_and_settings.sql` (последняя редакция `confirm_voice_batch` — копировать тело оттуда), `supabase/migrations/20260910100000_voice_pipeline.sql` (таблица и RLS `reminders` — образец), `supabase/migrations/20260910120000_realtime_publication.sql` (как добавлять таблицу в публикацию), `lib/ai/schema.ts`, `lib/ai/prompt.ts`, `lib/ai/examples.ts`, `tests/ai/parser_evals.jsonl`, `tests/ai/eval.ts`, `lib/store/ingest.ts`, `lib/voice/api.ts`, `app/api/voice/confirm/route.ts`, `components/confirm/format.ts`, `components/confirm/EntityCard.tsx`, `components/confirm/useSendBatch.ts`, `components/TabBar.tsx`, `components/ui/Toast.tsx` (тост с `action`), `components/tasks/AudioOriginal.tsx` (`{ path }` — проигрыватель оригинала), `lib/tasks/queries.ts` + `lib/realtime/useRealtimeQuery.ts` (образец хука с Realtime), `lib/tasks/mutations.ts` (образец мутации с optimistic-обновлением), `app/(director)/sent/page.tsx` (образец страницы директора), `lib/admin/reset-demo.ts`, `scripts/db-clean.ts`.
- Решения: D-52 §14 (поручение без имени — task; reminder только «напомни мне»), D-56 (id проставляет сервер), D-38 (окно доставки), D-75 (этот наряд).
- Факты о среде: dev-проект Supabase `qobsbjugromdwfdodwwa`; `pnpm test:rls` требует Docker Desktop — если Docker нет, pgTAP не запускать, а в WORKLOG написать «pgTAP 012 не выполнялся (нет Docker)» и проверить миграцию через приложение. Рабочая копия одна на все сессии: **`git add` только по путям из скоупа фазы**, никогда `git add -A`.
- Ветки — от **текущего HEAD** (не от `main`: `main` отстаёт и не содержит кода, на который наряд опирается). Старые миграции не править. Секретов в код не вносить. `db push` — только в dev.

---

## Фаза A — таблица `notes`, RLS, RPC (одна сессия)

### Ветка и скоуп
- Ветка: `feat/012a-notes-db`.
- Трогать только: `supabase/migrations/20260917200000_notes.sql` (новая), `supabase/tests/018_notes.test.sql` (новый), `lib/supabase/types.ts` (через `pnpm db:types`), `lib/admin/reset-demo.ts`, `scripts/db-clean.ts`.

### Шаги
1. **Миграция `20260917200000_notes.sql`** (одна на фазу; в шапке — по строке на пункт «зачем»):
   1. Таблица:
      ```sql
      create table notes (
        id                uuid primary key default gen_random_uuid(),
        company_id        uuid not null references companies,
        user_id           uuid not null references profiles,
        text              text not null,
        raw_transcript    text,                       -- what STT heard; never edited
        audio_path        text,                       -- voice bucket; never edited
        inbox_item_id     uuid references inbox_items on delete set null,
        pinned            boolean not null default false,
        converted_task_id uuid references tasks on delete set null,
        converted_announcement_id uuid references announcements on delete set null,
        converted_at      timestamptz,
        deleted_at        timestamptz,
        client_request_id uuid,
        created_at        timestamptz not null default now(),
        updated_at        timestamptz not null default now()
      );
      ```
      Триггер `moddatetime(updated_at)` по образцу `inbox_items`. Комментарий к таблице: «director's private thoughts; converted_* point at what the note became; deleted_at = soft delete».
   2. Индексы: `notes_user_active_idx on notes (user_id, created_at desc) where deleted_at is null`; уникальный `notes_client_request_idx on notes (client_request_id) where client_request_id is not null` (идемпотентность прямой вставки с клиента).
   3. RLS: `enable row level security`; четыре политики `notes_select / notes_insert / notes_update / notes_delete`, все с одним условием `company_id = (select auth_company_id()) and user_id = (select auth.uid())` (для insert — `with check`, для update — и `using`, и `with check`). Роль не проверяется намеренно (§0 п.2).
   4. Публикация Realtime: добавить `notes` в `supabase_realtime` тем же идемпотентным блоком, что в `20260910120000_realtime_publication.sql`.
   5. **`confirm_voice_batch`** — `create or replace` с телом из `20260910140000_points_and_settings.sql` (скопировать целиком, ничего кроме перечисленного не менять):
      - новые переменные: `v_note_ids uuid[] := '{}'::uuid[]`, `v_note uuid := nullif(payload->>'note_id', '')::uuid`;
      - ветка `elsif v_kind = 'note' then insert into notes (company_id, user_id, text, raw_transcript, audio_path, inbox_item_id) values (v_company, v_user, v_entity->>'text', payload->>'transcript', nullif(payload->>'audio_path', ''), v_inbox) returning id into v_id; v_note_ids := v_note_ids || v_id;` — ветку ставить перед `elsif v_kind = 'recurrence'`;
      - после цикла по сущностям, до сборки `v_result`: если `v_note is not null` — `update notes set converted_task_id = coalesce(v_task_ids[1], converted_task_id), converted_announcement_id = coalesce(v_ann_ids[1], converted_announcement_id), converted_at = p_now where id = v_note and user_id = v_user and deleted_at is null;` (чужую или удалённую заметку молча не трогаем);
      - в `v_result` добавить `'note_ids', to_jsonb(v_note_ids)`.
   6. Ветка `v_kind = 'announcement'` и `v_kind in ('task','delegation')` не меняются: аудио заметки едет в них через `payload->>'audio_path'`, который клиент подставит из заметки (фаза C).
2. `pnpm db:push` в dev, затем `pnpm db:types`.
3. **`lib/admin/reset-demo.ts`**: добавить `"notes"` в `ACTIVITY_TABLES` сразу после `"tasks"` (FK на tasks/announcements — `on delete set null`, порядок не критичен, но держим детей раньше родителей). **`scripts/db-clean.ts`**: у него свой список вызовов `wipe(...)` — добавить `await wipe("notes")` рядом с `wipe("reminders")`.
4. **pgTAP `018_notes.test.sql`** (по образцу `017`; id директора и менеджера взять из `001_rls_tasks.test.sql`):
   1. директор вызывает `confirm_voice_batch` с одной сущностью `{"kind":"note","text":"Идея: акция для Альфы","source_span":"..."}` и `payload.transcript = 'запиши мысль идея акция для Альфы'` → в `notes` одна строка, `raw_transcript` = транскрипт, `result->'note_ids'` длины 1;
   2. повтор с тем же `client_request_id` → `duplicate = true`, строк по-прежнему одна;
   3. **негатив**: под менеджером `select count(*) from notes` = 0; под сотрудником — 0; под `tv` — 0;
   4. директор вызывает `confirm_voice_batch` с сущностью `task` (исполнитель — Марат) и `payload.note_id` = id заметки из п.1 → у заметки `converted_task_id` = созданная задача, `converted_at` не null;
   5. директор делает `update notes set deleted_at = now()` своей заметке → 1 строка; менеджер делает такой же `update` → 0 строк (RLS).

### Проверки (обязательные, машинные)
```powershell
pnpm db:push; supabase migration list --linked
pnpm db:types; git diff --stat lib/supabase/types.ts
pnpm typecheck
pnpm lint
pnpm test
pnpm test:rls          # только при наличии Docker; иначе — строка в WORKLOG
```
Все должны завершиться успешно. Красная проверка = чинить в рамках скоупа, не расширяя его.

### Definition of Done (A)
- [ ] Шаги 1–4 выполнены, проверки зелёные.
- [ ] Если Docker нет: миграция проверена скриптом с service role (вставка заметки директору → под anon-ключом с JWT менеджера `select` возвращает 0 строк) — команда и вывод в отчёт.
- [ ] Коммиты: conventional commits, мелкие; `Co-Authored-By` — своей моделью исполнителя.
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 012A notes-db` + Сделано/Коммиты/Вопросы.
- [ ] Отчёт в чат: что сделано, вывод проверок (кратко), открытые вопросы.

---

## Фаза B — сущность `note` в парсере, карточка на /confirm, захват без подтверждения (одна сессия)

### Ветка и скоуп
- Ветка: `feat/012b-notes-parser`.
- Трогать только: `lib/ai/schema.ts`, `lib/ai/prompt.ts`, `lib/ai/examples.ts`, `tests/ai/parser_evals.jsonl`, `tests/ai/eval.ts` (только если гейт не знает новый kind), `components/confirm/format.ts`, `components/confirm/EntityCard.tsx`, `lib/store/ingest.ts`, `lib/store/ingest.test.ts` (если есть; иначе новый), `lib/notes/mutations.ts` (новый, минимум — см. шаг 6), `app/api/voice/confirm/route.ts` (только если `EntitySchema` требует правок контракта — обычно нет).

### Шаги
1. **`lib/ai/schema.ts`**: `NoteEntitySchema = z.strictObject({ kind: z.literal("note"), text: z.string(), source_span: z.string() })`. Добавить в оба union (`EntitySchema`, `ModelEntitySchema`) и экспортировать тип `NoteEntity`. Поле `text` — уже «причёсанная» мысль без вводных слов («запиши», «заметка», «мысль»): их убирает модель по правилу ниже.
2. **`lib/ai/prompt.ts`**:
   1. в «Типы сущностей» строка: `- note — мысль директора для себя, без исполнителя и без «напомни» («запиши мысль…», «заметка:», «идея:», «не забыть…»). Вводные слова не включай в text.`;
   2. правило 16: «ЗАМЕТКА vs ПОРУЧЕНИЕ vs НАПОМИНАНИЕ: „запиши/заметка/мысль/идея/не забыть“ без имени сотрудника → note. Есть имя сотрудника → task, даже если сказано „запиши“ („запиши Марату: позвонить Альфе“ — task). „Напомни мне …“ → reminder, как и раньше. Заметка без времени и адресата — НЕ task с пустым исполнителем (уточнение правила 14).»
3. **`lib/ai/examples.ts`**: пара П10 из двух реплик: «Запиши мысль: сделать акцию для Альфы к сезону» → одна `note` с `text: "Сделать акцию для Альфы к сезону"`; «Заметка: подумать про склад. И Марат, позвони Альфе сегодня до шести» → `note` + `task` (Марат, дедлайн 18:00 того же дня). Контекст примера — тот же четверг 13.08.2026 16:32.
4. **`tests/ai/parser_evals.jsonl`**: восемь кейсов `nt-01…08`: чистая заметка; заметка с «идея:»; «не забыть …»; заметка + задача с именем; «запиши Марату…» (ожидается task, не note); «напомни мне завтра…» (ожидается reminder, не note); бытовая заметка на казахском («жазып қой: …»); телеграф «мысль: скидки оптовикам». В `expected` для note — только `kind`. Если `tests/ai/eval.ts` считает F1 только по известным ему полям — проверить, что `note` попадает в подсчёт kind; править только при необходимости.
5. **Прогон `pnpm eval:parser`** — результат (assignee %, F1, число кейсов) целиком в отчёт и в WORKLOG. Гейты: assignee ≥97%, F1 ≥90%. Красный гейт — чинить промпт/пример, не evals.
6. **`lib/notes/mutations.ts`** (минимум для тоста): экспорт `softDeleteNotes(ids: string[]): Promise<void>` и `restoreNotes(ids: string[]): Promise<void>` — `update notes set deleted_at = now() | null where id in (...)` через `createBrowserSupabase()`; функции вызываемы вне React (тост живёт в store).
7. **`components/confirm/format.ts`**: `KIND_FORMS.note = ["заметка", "заметки", "заметок"]`; `KIND_ORDER` — `note` после `reminder`.
8. **`components/confirm/EntityCard.tsx`**: иконка и заголовок для `note` (по образцу `reminder`, цвет `var(--muted)` или ближайший токен нейтрального тона); текст редактируемый как у announcement; чипов срока/исполнителя нет.
9. **`lib/store/ingest.ts` — автозахват (§0 п.3)**: в `runParse`, после того как сущности пост-обработаны и перед `set({ ... stage: "confirm" })`: если `entities.length > 0` и **все** `kind === "note"` — не выставлять `confirm`, а сразу `await get().send(false, pointsEnabled?)` (points здесь не участвуют — передать `false`), после успеха: `toast(entities.length === 1 ? "Записал" : \`Записал ${n} заметки\`, { action: { label: "Отменить", onClick: () => void softDeleteNotes(noteIds) } })`, где `noteIds` — `result.result.note_ids`; затем `reset()`. При ошибке `send` — обычный путь `fail(cause, "send")` (оверлей покажет «повторить»). Написать чистую функцию `isNotesOnly(entities): boolean` и тест на неё (три случая: только заметки; заметка + задача; пусто → false).
10. Ручная проверка на dev через `TextSheet` (текстовый ввод директора): «запиши мысль: проверить склад в пятницу» → тоста «Записал» достаточно, /confirm не открывается, строка в `notes` есть; «запиши мысль про акцию и Марат позвони Альфе» → открывается /confirm с двумя карточками.

### Проверки (обязательные, машинные)
```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm eval:parser       # результат — в отчёт и WORKLOG целиком
pnpm build
```

### Definition of Done (B)
- [ ] Шаги 1–10 выполнены, проверки зелёные, гейты evals пройдены и приложены.
- [ ] Коммиты: conventional commits, мелкие; `Co-Authored-By` — своей моделью исполнителя.
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 012B notes-parser` + Сделано/Коммиты/Evals/Вопросы.
- [ ] Отчёт в чат: что сделано, вывод проверок (кратко), открытые вопросы.

---

## Фаза C — страница `/notes`, редактирование, удаление, «Поручить» и «Объявить» (одна сессия)

### Ветка и скоуп
- Ветка: `feat/012c-notes-screen`.
- Трогать только: `app/(director)/notes/page.tsx` (новая), `components/notes/*` (новые), `lib/notes/queries.ts` (новый), `lib/notes/mutations.ts` (расширить), `lib/notes/list.ts` + `lib/notes/list.test.ts` (новые, чистые функции), `lib/store/ingest.ts`, `lib/voice/api.ts`, `app/api/voice/confirm/route.ts`, `components/TabBar.tsx`, `components/ui/PageSkeletons.tsx` (скелет списка).

### Шаги
1. **`lib/notes/queries.ts`**: тип `Note` из `Database["public"]["Tables"]["notes"]["Row"]`; `noteKeys`; хук `useNotes(me)` на `useRealtimeQuery`: `select * from notes where deleted_at is null order by created_at desc limit 300` (RLS отрежет чужие), канал `notes` с фильтром `user_id=eq.<me.id>`; `onEvent`: INSERT/UPDATE — патч кэша из `payload.new` (удалённая/чужая строка выбрасывается), DELETE — выброс по id; иначе `invalidateQueries`.
2. **`lib/notes/list.ts`** (чистые функции + тесты): `splitNotes(notes) → { active, converted }` (converted — `converted_task_id ?? converted_announcement_id` не null; active — остальные, `pinned` первыми, дальше по `created_at desc`); `filterNotes(notes, query)` — регистронезависимая подстрока по `text`, пустой запрос = все; `firstLine(text)` — первая непустая строка для заголовка карточки.
3. **`lib/notes/mutations.ts`**: хуки на `useMutation` по образцу `lib/tasks/mutations.ts` (optimistic → patch кэша `noteKeys` → откат при ошибке → тост `GENERIC_ERROR`):
   - `useCreateNote()` — прямая вставка `{ text, company_id: me.company_id, user_id: me.id, client_request_id: crypto.randomUUID() }` (ввод с клавиатуры на самой странице заметок парсер не вызывает: это уже заметка);
   - `useUpdateNote()` — `{ id, text }` и `{ id, pinned }`; вызов из редактора с дебаунсом 600 мс и на blur; последний пишущий побеждает;
   - `useDeleteNote()` — мягкое удаление с тостом «Удалил» + «Отменить» (через `restoreNotes`); из кэша строка уходит сразу.
4. **Экран `app/(director)/notes/page.tsx`** (`Screen title="Заметки"`, скелет из `PageSkeletons`):
   - сверху поле поиска (обычный `input`, плейсхолдер «Найти в заметках») и под ним строка быстрого ввода: `textarea` в одну строку с плейсхолдером «Записать мысль…», отправка по кнопке «Записать» (и Ctrl/Cmd+Enter); после записи поле очищается, заметка появляется сверху;
   - лента `active`: карточка `NoteCard` — первая строка (одна строка, обрезка), ниже до двух строк остатка (`line-clamp-2`), время `humanAqtobe(created_at)`, чипы: «🎤» если `audio_path` (по тапу разворачивает `AudioOriginal path=…`), «📌» если `pinned`;
   - тап по карточке раскрывает её на месте (`Disclosure` или своё состояние `openId`): `textarea` с авторостом, значение — `text`, автосохранение (шаг 3), без кнопки «Сохранить»; под ним строка действий из четырёх кнопок `Button` (варианты по `docs`-токенам, не изобретать): **«Поручить»**, **«Объявить»**, **«Закрепить/Открепить»**, **«Удалить»**;
   - секция «В деле · N» (свёрнутая `Disclosure`) со списком `converted`: у карточки подпись «→ задача» / «→ объявление», тап ведёт на `/tasks/[id]` для задачи; объявление — без перехода; текст в этой секции не редактируется, действий нет;
   - пустое состояние: «Пока пусто. Скажи маскоту „запиши мысль…“ или напиши здесь»;
   - всё рендерится при ширине 320 px без горизонтального скролла; кнопки действий — цели 44 px.
5. **`components/TabBar.tsx`**: вкладка директора `{ href: "/notes", label: "Заметки", icon: ICONS.notes }` между «Задачи» и «Настройки»; иконка — простой контурный SVG в стиле остальных (лист с уголком). Вкладок у директора становится пять — допустимо.
6. **Конвертации (§0 п.5), `lib/store/ingest.ts`**:
   - в состояние — `noteId: string | null` (в `initialState` — `null`), в `send()` — `...(noteId ? { note_id: noteId } : {})`;
   - действие `startFromNote(note: { id: string; text: string; audio_path: string | null }, as: "task" | "announcement")`: `set({ ...initialState, clientRequestId: crypto.randomUUID(), source: "typed", transcript: note.text, audioPath: note.audio_path, noteId: note.id, stage: "confirm", entities: [manual], parsedEntities: [] })`, где `manual` для `task` — ровно как в `startManual` (с `blocked: "assignee_unmatched"`, чтобы без исполнителя не отправилось), для `announcement` — `{ kind: "announcement", text: note.text, source_span: note.text }`;
   - **`lib/voice/api.ts`**: `ConfirmRequest.note_id?: string`; **`app/api/voice/confirm/route.ts`**: `note_id: z.uuid().optional()` в `BodySchema` и `note_id: body.note_id ?? null` в payload RPC.
   - кнопки «Поручить»/«Объявить» на карточке вызывают `startFromNote(note, …)`; дальше существующий `IngestOverlay` сам уводит на /confirm с любой страницы, кроме `/pulse` (строка ~100) — в оверлее ничего не менять. После отправки заметка по Realtime переезжает в «В деле» без перезагрузки.
7. Ручная проверка на dev: (а) голосом/текстом «запиши мысль: …» → заметка появляется на `/notes` без перезагрузки; (б) правка текста → перезагрузка → текст сохранён; (в) «Удалить» → «Отменить» в тосте → заметка вернулась; (г) «Поручить» → /confirm → выбор Марата → «Отправить» → у Марата задача с текстом заметки, заметка ушла в «В деле · 1» с подписью «→ задача»; (д) «Объявить» → объявление в Эфире, заметка в «В деле»; (е) оффлайн: выключить сеть, поправить текст, включить → правка доехала один раз (проверить `updated_at`); (ж) под менеджером `/notes` недоступна (группа `(director)`), а прямой `select` из консоли возвращает пусто.
8. `pnpm smoke:ui` со скриншотами `/notes` (iPhone SE и средний Android) — приложить пути к файлам в отчёт.

### Проверки (обязательные, машинные)
```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
# в отдельном терминале: pnpm dev
pnpm smoke:ui
```

### Definition of Done (C)
- [ ] Шаги 1–8 выполнены, проверки зелёные, скриншоты приложены.
- [ ] Ручная проверка (шаг 7) пройдена по всем семи пунктам; что не прошло — в отчёт, не чинить за пределами скоупа.
- [ ] Коммиты: conventional commits, мелкие; `Co-Authored-By` — своей моделью исполнителя.
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 012C notes-screen` + Сделано/Коммиты/Вопросы.
- [ ] Отчёт в чат: что сделано, вывод проверок (кратко), открытые вопросы.

---

## Вне скоупа наряда (не делать; идеи — в WORKLOG «бэклог»)
- Личное сообщение сотруднику из заметки (нет примитива — D-75, открыто).
- Слияние `reminders` в `notes`, кнопка «Напомнить» (D-75, открыто).
- Теги, папки, история ревизий, rich-text, «причесать текст» по тапу.
- Упоминание заметок в докладе Капли на Пульсе.
- Правки `docs/DATABASE.md`, `docs/AI.md`, `docs/FRONTEND.md` — сделает архитектор при приёмке.
