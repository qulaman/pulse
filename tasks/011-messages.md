# tasks/011-messages.md — Сообщения в задачах: доставка, тред-мессенджер, ответ без ухода с Пульса

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропускать нельзя). Семантическое ревью сделает отдельная сессия. Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай.

> Источник: `archive/MESSAGES_PLAN.md` (диагноз Опуса, 2026-09-17) после правок архитектора. Диагноз подтверждён по коду целиком; изменены порядок работ и семь пунктов (см. §0). Этот файл — единственный текст наряда; в план не заглядывать.

Наряд состоит из **четырёх фаз = четырёх сессий и веток**: E → B → C → D. Фаза A (сводка треда на `tasks`) **отложена до замера** и в этом наряде не исполняется (§6). Каждая фаза — отдельная запись в WORKLOG и отдельный отчёт; следующую фазу начинать только после приёмки предыдущей архитектором.

---

## 0. Что изменено относительно archive/MESSAGES_PLAN.md (для архитектора и владельца; исполнителю — только к сведению)

1. **Порядок: E → B → C → D, A по замеру.** §0 плана сам говорит, что объём строк не проблема годами; денормализация не должна отодвигать закрытие Д-1 (сообщение сотрудника не уведомляет никого) и голос в треде.
2. **Д-2** чинится патчем кэша из payload UPDATE (Realtime присылает строку целиком), а не рефетчем.
3. **Курсор прочтения** переезжает в RPC `mark_thread_read` с `greatest(old, new)`: оффлайн-повтор старого «Прочитал» сейчас может откатить курсор назад. Это в E, не в B.
4. **Пагинация треда** — не быстрый фикс (меняет форму кэша); переносится из E в C.
5. **Тихие часы для сообщений директору** = открытый вопрос D-51 п.2, решается один раз; до решения — как сейчас (не держатся).
6. **Адресат сообщения** определён явно: все участники треда, кроме отправителя (автор ∪ исполнитель); менеджер как отправитель не теряется.
7. **✓✓ для сотрудника** (видит ли он, что директор прочитал) — по умолчанию НЕТ до визы владельца: квитанции читает директор (принцип 8). Колонки `*_seen_seq` на `tasks` из плана не вводятся.

Решения архитектора в зоне G (фиксируются в DECISIONS.md как D-64 при старте фазы E): отчёт при сдаче едет внутрь `transition_task` (`payload.report`); аудио сообщений живёт в бакете `voice` по тем же правилам, что директорские, пока открыт D-18; формулировка схлопнутого пуша — §B.1.

---

## Контекст (читать только это, общий для всех фаз)

- `CLAUDE.md`: принципы 1, 2, 5, 7, 8; регламент п.4 (миграции), п.6 (время).
- `docs/DATABASE.md`: разделы `task_messages`, `task_reads`, RLS-строки про `task_messages`/`task_reads`, список индексов.
- `docs/BACKEND.md` §4 (outbox, `notification_deliveries`), контракт `/api/tasks/[id]/transition`, `/api/voice/upload-url` и `/api/voice/transcribe` с `context='task_message'`.
- Код, который трогаем (читать по мере шагов, не заранее): `lib/tasks/queries.ts`, `lib/tasks/mutations.ts`, `lib/pulse/board.ts` (+`board.test.ts`), `lib/pulse/employee.ts`, `lib/realtime/useRealtimeQuery.ts`, `lib/push/send.ts`, `public/sw.js`, `app/api/push/seen/route.ts`, `app/api/files/url/route.ts`, `app/api/tasks/[id]/transition/route.ts`, `components/tasks/TaskThread.tsx`, `components/tasks/TaskCard.tsx`, `components/tasks/TaskSheets.tsx`, `components/tasks/PhotoMessage.tsx`, `components/tasks/DeliveryStatus.tsx`, `components/pulse/TaskTile.tsx`, `app/tasks/[id]/page.tsx`, `app/(employee)/feed/page.tsx`, `lib/voice/api.ts`, `lib/voice/recorder.ts`, `lib/files/photo.ts`.
- Миграции-предшественники (только как справка по именам функций/триггеров): `20260907120100_tasks_and_messages.sql`, `20260910180000_delivery_outbox.sql`, `20260911210000_outbox_replies.sql`, `20260911220000_reassign_window_reply_dedupe.sql`, `20260911230000_deliver_after.sql`, `20260916140000_task_reads.sql`.
- Решения: D-03 (вопрос — сообщение), D-32 (семантика «увидел», «не открывал с 9:14»), D-38/D-51 (тихие часы как `deliver_after`), D-61 (курсор прочтения), G.7 (`answered_at` триггером), D-60 (шторки на телефоне), D-62 (лента сотрудника).
- Факты о среде: dev-проект Supabase `qobsbjugromdwfdodwwa`; `pnpm test:rls` требует Docker Desktop — если Docker нет, pgTAP не запускать, а в WORKLOG написать «pgTAP NNN не выполнялся (нет Docker)» и проверить миграцию через приложение.
- Старые миграции не править. Секретов в код не вносить. `db push` — только в dev.

---

## Фаза E — быстрые фиксы (одна сессия)

### Ветка и скоуп
- Ветка: `feat/011e-messages-fixes` от `main`.
- Трогать только: `supabase/migrations/20260917120000_messages_fixes.sql`, `supabase/tests/015_mark_thread_read.test.sql`, `lib/supabase/types.ts` (через `pnpm db:types`), `lib/tasks/queries.ts`, `lib/tasks/mutations.ts`, `lib/tasks/thread.ts` (новый) + `lib/tasks/thread.test.ts`, `lib/pulse/board.ts`, `lib/pulse/board.test.ts`, `lib/pulse/employee.ts`, `components/pulse/TaskTile.tsx` и другие вызовы `hasUnread`/`hasMessage`/`messageOf` (только сигнатура), `app/(employee)/feed/page.tsx`, `WORKLOG.md`.

### Шаги
1. **Миграция `20260917120000_messages_fixes.sql`** (одна на фазу):
   1. `alter table task_reads alter column last_seq type bigint;`
   2. RPC `mark_thread_read(task_id uuid, seq bigint) returns bigint`, `security definer`, `set search_path = public`: `insert into task_reads (task_id, user_id, company_id, last_seq, seen_at) values ($1, auth.uid(), auth_company_id(), $2, now()) on conflict (task_id, user_id) do update set last_seq = greatest(task_reads.last_seq, excluded.last_seq), seen_at = now() returning last_seq`. Перед upsert — проверка, что вызывающий видит задачу: `if not exists (select 1 from tasks t where t.id = task_id and t.company_id = auth_company_id()) then raise exception 'task_not_found' using errcode='P0001'`. `revoke execute ... from public, anon; grant execute ... to authenticated, service_role`. Политики `task_reads_insert/update` **не удалять** (клиент их больше не использует, но они безвредны).
   3. Индексы: `create index task_messages_task_seq_idx on task_messages (task_id, seq desc);` и `create index task_messages_board_notes_idx on task_messages (task_id, created_at desc) where meta->>'is_question' = 'true' or meta->>'decline_reason' = 'true';`
   4. RLS `task_messages_select` и `task_messages_insert`: `drop policy` + `create policy` с тем же телом, но `auth.uid()` → `(select auth.uid())`, `auth_company_id()` → `(select auth_company_id())`, `auth_role()` → `(select auth_role())`. То же для трёх политик `task_reads_*`. Семантика не меняется.
   5. Комментарий в шапке миграции: зачем каждый пункт (одна строка на пункт).
2. `pnpm db:push` в dev, затем `pnpm db:types`.
3. **`lib/tasks/mutations.ts` → `useMarkRead`**: вместо upsert в `task_reads` — `supabase.rpc("mark_thread_read", { task_id, seq })`. `MarkReadInput` оставить как есть (companyId больше не нужен RPC — поле можно оставить для совместимости вызовов, не трогать вызовы).
4. **Д-2, `lib/tasks/queries.ts` → `useTaskMessages.onEvent`**: для `payload.eventType === "UPDATE"` — не инвалидировать, а `client.setQueryData(queryKey, old => applyMessageUpdate(old, payload.new))`; для `INSERT`/`DELETE` — как сейчас (`invalidateQueries`, курсорный догон). Чистую функцию `applyMessageUpdate(messages: TaskMessage[] | undefined, row: Partial<TaskMessageRow> & { id: string })` положить в новый `lib/tasks/thread.ts`: находит строку по `id`, подменяет `content`, `meta`, `file_path`, `type` из payload, сохраняет `sender`; если строки нет — возвращает вход без изменений (тот же массив по ссылке). Тест `lib/tasks/thread.test.ts`: (а) `answered_at` в `meta` встаёт на старую строку; (б) чужой id — ссылка та же; (в) `sender` сохранён.
5. **Д-3, `lib/pulse/board.ts`**: `hasUnread(task, meId)` — условие `last.sender_id !== meId && last.seq > task.seen_seq && CHAT_TYPES.includes(last.type)`; `hasMessage(task, meId)`, `messageOf(task, meId)` получают `meId` и передают дальше; в `applyMessage` добавить параметр `meId` и заменить `message.sender_id === current.assignee_id ? current.seen_seq : max(...)` на `message.sender_id === meId ? max(current.seen_seq, message.seq) : current.seen_seq`. `hasUnreadFor` из `lib/pulse/employee.ts` удалить, заменив вызовы на `hasUnread` из board.ts. Обновить все вызовы (grep по `hasUnread(`, `hasMessage(`, `messageOf(`, `applyMessage(`) — `meId` берётся из `useMe().data.userId`; в `usePulseBoard` прокинуть `meId` параметром (см. шаг 6). Тесты в `board.test.ts`: сообщение менеджера (не исполнителя) выше курсора — непрочитано; своё сообщение — нет; `applyMessage` со своим сообщением двигает курсор, с чужим — нет.
6. **Д-9, `usePulseBoard`**: сигнатура `usePulseBoard(me: Me | undefined, enabled = true)`. Для роли `employee`: канал `tasks` с `filter: "assignee_id=eq.<userId>"`, а `fetchBoard` получает `assigneeId` и добавляет `.eq("assignee_id", assigneeId)`; для `director`/`manager` — без фильтра, как сейчас. Канал `task_messages` остаётся без фильтра (в строке нет `assignee_id`; RLS режет на сервере) — это осознанно, комментарий в коде. Обновить вызовы в `app/(director)/pulse/page.tsx` и `app/(employee)/feed/page.tsx`.
7. **pgTAP `015_mark_thread_read.test.sql`** (по образцу `014`): (а) директор вызывает `mark_thread_read(task 004, 5)` → `last_seq = 5`; (б) повтор с `2` → по-прежнему `5` (greatest); (в) сотрудник (`...0007`) вызывает с `3` → у него своя строка `3`, строка директора не изменилась; (г) `mark_thread_read` по задаче чужой компании → `throws_ok` `P0001`.

### Проверки (обязательные, машинные)
```powershell
pnpm db:push; supabase migration list --linked
pnpm db:types; git diff --stat lib/supabase/types.ts
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:rls          # только при наличии Docker; иначе — строка в WORKLOG
# в отдельном терминале: pnpm dev
pnpm smoke:board       # проверяет, что на dev никто не активен; событие → плитка без рефетча
```
Все должны завершиться успешно. Красная проверка = чинить в рамках скоупа, не расширяя его.

### Definition of Done (E)
- [ ] Шаги 1–7 выполнены, проверки зелёные.
- [ ] Ручная проверка в двух вкладках Chrome (директор + Марат): Марат задаёт вопрос через «Уточнить» → директор отвечает в треде → в треде Марата подпись вопроса меняется на «отвечено» **без перезагрузки** (Д-2 закрыт).
- [ ] Коммиты: conventional commits, мелкие; `Co-Authored-By` — своей моделью исполнителя.
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 011E messages-fixes` + Сделано/Коммиты/Вопросы.
- [ ] Отчёт в чат: что сделано, вывод проверок (кратко), открытые вопросы.

---

## Фаза B — доставка сообщений с квитанциями (одна сессия, после приёмки E)

### Ветка и скоуп
- Ветка: `feat/011b-messages-delivery` от `main`.
- Трогать только: `supabase/migrations/20260917130000_message_deliveries.sql`, `supabase/tests/016_message_deliveries.test.sql`, `lib/supabase/types.ts` (db:types), `lib/push/send.ts`, `public/sw.js`, `app/api/push/acted/route.ts` (новый), `app/api/tasks/[id]/transition/route.ts` (один фильтр), `lib/tasks/receipts.ts` (новый) + тест, `components/tasks/TaskThread.tsx` (одна строка квитанции под последним своим сообщением директора), `docs/BACKEND.md` §4 (таблица событий — только добавить строку `message`), `WORKLOG.md`.

### Шаги
1. **Миграция `20260917130000_message_deliveries.sql`**:
   1. `drop trigger trg_notify_outbox_questions on task_messages; drop trigger trg_notify_outbox_replies on task_messages; drop function notify_outbox_question(); drop function notify_outbox_reply();`
   2. Функция `notify_outbox_message() returns trigger`, `security definer`, `set search_path = public`, триггер `trg_notify_outbox_messages after insert on task_messages for each row`. Логика:
      - выход без действия, если `new.type not in ('text','voice','photo')` или в `new.meta` любой из флагов `decline_reason`, `rework_comment`, `report` равен `true` (у этих событий свой пуш: `declined`, `rework`, `pending_review`);
      - `v_task` — строка `tasks`; адресаты: `select distinct unnest(array[v_task.author_id, v_task.assignee_id]) except new.sender_id` (null отбросить);
      - имя отправителя: `split_part(coalesce(p.full_name,''), ' ', 1)` из `profiles`; для директора — слово «Директор» (если `p.role = 'director'`);
      - `v_words`: `text` → `left(content,120)`; `photo` → `'Фото' || case when content <> '' then ': ' || left(content,100) end`; `voice` → `'Голосовое' || case when content <> '' then ': ' || left(content,100) end`;
      - `v_title`: вопрос (`meta.is_question = true`) → `'Вопрос по «' || left(v_task.title,60) || '»'`; иначе `v_sender || ' · «' || left(v_task.title,60) || '»'`;
      - **схлопывание**: для каждого адресата `update notification_deliveries set meta = meta || jsonb_build_object('count', coalesce((meta->>'count')::int,1)+1, 'body', <новое>, 'title', v_title, 'last_seq', new.seq, 'message_id', new.id) where user_id = адресат and task_id = v_task.id and event_kind = 'message' and status = 'queued' returning id`; если строка обновлена — `body` = `count || ' новых сообщения · ' || v_words` (склонение через `case count when 2,3,4 then 'новых сообщения' else 'новых сообщений'`; числа 22, 23 и т.д. не усложнять); если не обновлена — `insert ... (company_id, user_id, task_id, event_kind, meta) values (..., 'message', jsonb_build_object('title', v_title, 'body', v_words, 'url', '/tasks/' || v_task.id, 'tag', 'task:' || v_task.id, 'count', 1, 'last_seq', new.seq, 'message_id', new.id, 'is_question', <bool>))`.
   3. `notification_deliveries_deliver_after()`: `create or replace` с добавлением: `if new.event_kind = 'message' and exists (select 1 from tasks t where t.id = new.task_id and t.author_id <> new.user_id) then new.deliver_after := coalesce(next_delivery_slot(new.company_id, now()), now()); end if;` — сообщение **сотруднику** ждёт окна, сообщение **директору** (он автор) уходит сразу (как сейчас `question`; открытый вопрос D-51 п.2).
   4. `mark_thread_read(task_id uuid, seq bigint)`: `create or replace` — после upsert курсора добавить `update notification_deliveries set acted_at = coalesce(acted_at, now()), seen_at = coalesce(seen_at, now()) where user_id = auth.uid() and task_id = $1 and event_kind = 'message' and acted_at is null and coalesce((meta->>'last_seq')::bigint, 0) <= $2;`
   5. Комментарий в шапке: событие `message` заменяет `question`/`reply`; старые строки этих kind в таблице остаются как история.
2. `pnpm db:push`, `pnpm db:types`.
3. **`lib/push/send.ts`**: в payload пуша добавить `tag: (row.meta as any).tag ?? null` и `kind: row.event_kind`. Ничего больше.
4. **`public/sw.js`**: `tag: data.tag || data.delivery_id || undefined`, `renotify: Boolean(data.tag)`; если `data.kind === "message"` — `options.actions = [{ action: "read", title: "Прочитал" }, { action: "open", title: "Открыть" }]`. В `notificationclick`: если `event.action === "read"` — `fetch("/api/push/acted", { method: "POST", credentials: "include", headers: {"content-type":"application/json"}, body: JSON.stringify({ delivery_id }) })` и **не открывать** окно; иначе — как сейчас. (На iOS кнопок у уведомлений нет — код должен работать и без них; проверка на телефоне — за владельцем.)
5. **`app/api/push/acted/route.ts`** (по образцу `seen`): `withAuth("any")`, тело `{ delivery_id: uuid }`; service-клиентом читает доставку `id = delivery_id and user_id = profile.userId`; если нет — `apiOk({ok:false})`; иначе вызывает `mark_thread_read` **от имени пользователя** (`userSupabase(req).rpc(...)` с `task_id` и `meta.last_seq` доставки) — RPC сам закроет `acted_at`. Без auth-обходов.
6. **`app/api/tasks/[id]/transition/route.ts`**: в блоке `after` для `accepted` добавить `.eq("event_kind", "task_sent")` — принятие задачи не должно закрывать квитанции сообщений.
7. **`lib/tasks/receipts.ts`** (новый): `useThreadReceipt(taskId, enabled)` через `useRealtimeQuery` — последняя строка `notification_deliveries` с `task_id = taskId and event_kind = 'message'`, `order created_at desc, limit 1` (RLS: директор видит все строки компании; сотрудник — только свои, поэтому хук включается **только для роли director**). Чистая функция `receiptLine(d, now): { text, tone } | null` (тест): `acted_at` → `«прочитал HH:MM»` (ok); `seen_at` → `«увидел HH:MM»` (muted); `status='sent'` → `«не открывал с HH:MM»` (warn, время — `sent_at`); `failed` + `no_subscription` → `«уведомления не включены»`; `queued` c `deliver_after > now` → `«отправлю в HH:MM»` (тихие часы); иначе `null`. Время — `humanAqtobe`.
8. **`components/tasks/TaskThread.tsx` → `TaskChat`**: под **последним своим** сообщением директора (variant director) — строка `receiptLine` мелким шрифтом справа. У сотрудника ничего не показывать (решение по умолчанию, §0 п.7).
9. **pgTAP `016_message_deliveries.test.sql`** (фикстуры и роли — как в `012_outbox_replies`): (а) сотрудник пишет `text` → одна строка `message` для автора, `meta.count = 1`; (б) второе сообщение подряд при `status='queued'` → строк по-прежнему одна, `count = 2`, `last_seq` = seq второго; (в) сообщение с `meta.report = true` → строк не прибавилось; (г) причина отказа (`decline_reason`) → не прибавилось; (д) директор пишет `text` → строка `message` для исполнителя, `deliver_after >= now()`; (е) `mark_thread_read(task, last_seq)` от автора → у его строки `acted_at is not null`.
10. `docs/BACKEND.md` §4: в таблицу событий outbox добавить строку `message` (адресаты, схлопывание, тихие часы), строки `question`/`reply` пометить «заменены на `message` 2026-09-17».

### Проверки (обязательные, машинные)
```powershell
pnpm db:push; supabase migration list --linked
pnpm db:types
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:rls          # при наличии Docker
# в отдельном терминале: pnpm dev
pnpm smoke:board
```

### Definition of Done (B)
- [ ] Шаги 1–10, проверки зелёные.
- [ ] Ручная проверка (две вкладки + Android Chrome с включённым push у директора): Марат пишет три обычных сообщения подряд → у директора **одно** уведомление «Марат · «…»» с «3 новых сообщения · …»; тап «Прочитал» в шторке уведомления → в Пульсе метка непрочитанного гаснет без открытия приложения; в треде у директора под его последним сообщением — «не открывал с HH:MM» → после открытия треда Маратом — «прочитал HH:MM».
- [ ] Коммиты, WORKLOG (`011B messages-delivery`), отчёт в чат — как в E.

---

## Фаза C — тред как мессенджер (одна сессия, после приёмки B)

### Ветка и скоуп
- Ветка: `feat/011c-thread` от `main`.
- Трогать только: `supabase/migrations/20260917140000_report_in_transition.sql`, `supabase/tests/017_report_in_transition.test.sql`, `lib/supabase/types.ts`, `app/api/tasks/[id]/transition/route.ts`, `app/api/files/url/route.ts`, `lib/tasks/mutations.ts`, `lib/tasks/queries.ts`, `lib/tasks/thread.ts` (+тест), `components/tasks/TaskThread.tsx` → разбить на `components/tasks/thread/*` (ThreadView, MessageRow, SystemRow, DaySeparator, Composer, VoiceMessage), `components/tasks/PhotoMessage.tsx`, `components/tasks/TaskCard.tsx` (только `ReportSheet` → `complete`), `components/tasks/TaskSheets.tsx` (`ReportSheet` — без изменений логики фото), `app/tasks/[id]/page.tsx`, `lib/ui/useVisualViewport.ts` (новый), `WORKLOG.md`.

### Шаги
1. **Д-4 — отчёт внутрь `transition_task`.** Миграция `20260917140000_report_in_transition.sql`: `create or replace function transition_task(...)` (та же сигнатура) с новыми локальными `v_report_text := nullif(payload->'report'->>'text','')`, `v_report_path := nullif(payload->'report'->>'file_path','')`; после существующего блока reason/comment: если `v_report_text is not null or v_report_path is not null` → `insert into task_messages (company_id, task_id, sender_id, type, content, file_path, meta) values (v_company, v_task, coalesce(v_user, v_author), case when v_report_path is not null then 'photo' else 'text' end, v_report_text, v_report_path, '{"report": true}'::jsonb)`. Роут: `BodySchema` + `report: z.strictObject({ text: z.string().optional(), file_path: z.string().optional() }).optional()`, прокинуть в `payload.report`. Клиент: `TransitionInput.report?`, `TaskActions.complete({ taskId, fromStatus, report? })` — для `rework` отчёт уходит **со вторым** вызовом (`pending_review`); `ReportSheet.onSubmit` вызывает только `complete` (никакого `sendMessage`). pgTAP 017: сдача с отчётом → ровно одна строка `task_messages` с `meta.report = true` и ровно одна доставка `pending_review`, ноль `message`; повтор с тем же `client_request_id` — строк не прибавилось.
2. **`/api/files/url`** — принимать `message_id` вместо `path`: под RLS `select id, type, file_path from task_messages where id = message_id`; бакет по типу: `photo` → `photos`, `voice` → `voice`; подписать `file_path`. Параметр `path` убрать; `PhotoMessage` переводится на `message_id`. Новый `VoiceMessage` (плеер `<audio controls preload="none">`, URL по тапу, ошибка «Не открылось. Попробуй позже») — тем же роутом.
3. **Голос в треде.** В `Composer`: кнопка-микрофон с **удержанием** (`createRecorder` из `lib/voice/recorder.ts`, тот же жест, что у маскота: нажал — пишет, отпустил — отправил, увёл палец в сторону — отмена; хаптик через `lib/haptics.ts`, если он есть). Конвейер, принцип 5 (аудио раньше AI): `voiceApi.uploadUrl({ ext, context: "task_message" })` → PUT файла по signed URL → **сразу** `sendMessage({ type: "voice", filePath: audio_path, text: "" })` (сообщение существует до транскрипции) → `voiceApi.transcribe({ audio_path, context: "task_message", client_request_id })` → при успехе **второй insert не делать**: у `task_messages` нет update-политики, поэтому транскрипт пишет сам `transcribe`-роут: расширить его тело полем `message_id?: uuid` и для `context='task_message'` с `message_id` обновлять `task_messages.content` **service-клиентом** после проверки, что `sender_id = profile.userId` и `file_path = audio_path`. Транскрипт в треде появится через Realtime UPDATE (Д-2 уже чинит патч). Если STT упал — сообщение остаётся «Голосовое» с плеером; ничего не теряется.
   - `SendMessageInput` получает `type?: "text" | "photo" | "voice"` (по умолчанию выводится из `filePath`, как сейчас; для voice — явно).
   - Роут `transcribe` в скоупе только этим полем; `lib/voice/api.ts` — тип `TranscribeRequest` + поле.
4. **Фото из композера**: кнопка «+» → тот же выбор файла и загрузка, что в `ReportSheet` (`lib/files/photo.ts`), подпись — текст из поля; отправка `sendMessage({ filePath, text })`.
5. **Состояния сообщения** (`lib/tasks/thread.ts`, тест): `pending` (часики) → в базе (✓, `seq` настоящий) → у директора ✓✓ по `receiptLine` из B (только под последним своим). Ошибка: `useSendMessage.onError` — при `NetworkError` строку **не убирать** (она в outbox и доедет), при другой ошибке пометить `meta.failed = true` и показать «не отправилось · повторить»; тап повторяет `mutate` с **тем же `id`**. `Composer` не блокируется на время отправки.
6. **Страница `/tasks/[id]` → тред.** Сверху свёрнутая карточка: строка `TaskCapsule`-вида (статус-точка, заголовок, дедлайн, исполнитель) — тап раскрывает полную `TaskCard` (кнопки роли) и `TaskDates`; по умолчанию свёрнута, кроме статусов, где у роли есть действие (`sent`/`rework` для сотрудника; `pending_review`/`declined` для директора) — тогда раскрыта. `TaskTimeline` удалить; `status_change` и `system` рендерить в общей ленте тонкими системными строками (`SystemRow`: текст из `status-text`, время), между днями — `DaySeparator` («Сегодня», «Вчера», дата). Метки `Отчёт` / `Причина отказа` / `Комментарий к доработке` / `Вопрос · отвечено` — как сейчас в `MessageRow`.
7. **Пагинация**: первая загрузка — `order seq desc limit 50` → развернуть; кнопка «Показать раньше» над лентой, пока последняя страница вернула 50: запрос `seq < minSeq` `limit 50`, слияние `mergeBySeq`. Курсорный догон по `lastSeq` (max) не меняется. `hasMore` — состояние компонента, не кэша.
8. **Клавиатура**: `lib/ui/useVisualViewport.ts` — хук, отдающий `offsetBottom = window.innerHeight - visualViewport.height - visualViewport.offsetTop` (0 на десктопе); композер ставится на `bottom: calc(offsetBottom + 56px + env(safe-area-inset-bottom))`; при фокусе поля лента прокручивается к последнему сообщению. Таб-бар не трогать.
9. Проверить `app/dev/*` песочницы на компиляцию после переименований (менять только импорты).

### Проверки (обязательные, машинные)
```powershell
pnpm db:push; supabase migration list --linked
pnpm db:types
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:rls          # при наличии Docker
# в отдельном терминале: pnpm dev
pnpm smoke:ui
pnpm smoke:board
```

### Definition of Done (C)
- [ ] Шаги 1–9, проверки зелёные.
- [ ] Смоук «Android-запись → iPhone-воспроизведение» голосового в треде — владелец (в отчёте указать, что ждёт проверки).
- [ ] Оффлайн: сообщение, отправленное без сети, доезжает ровно один раз после появления сети; строка не исчезала.
- [ ] Коммиты, WORKLOG (`011C thread`), отчёт в чат.

---

## Фаза D — директор отвечает, не уходя с Пульса (одна сессия, после приёмки C)

### Ветка и скоуп
- Ветка: `feat/011d-thread-sheet` от `main`.
- Трогать только: `components/tasks/thread/ThreadSheet.tsx` (новый), `components/pulse/TaskTile.tsx`, `components/pulse/*` там, где открывается `/tasks/[id]` из панели «Сообщения» и из мысли маскота, `app/(director)/pulse/page.tsx`, `app/(employee)/feed/page.tsx` (карточка в панели «Сообщения»), `docs/FRONTEND.md` (разделы «Пульс» и «Лента» — только абзац про тред в шторке), `WORKLOG.md`.

### Шаги
1. `ThreadSheet` — `Sheet` из `components/ui` на всю высоту минус шапка, внутри `ThreadView` из C (тот же компонент, что на странице) с параметром `compact`; в шапке заголовок задачи и ссылка «Открыть полностью» → `/tasks/[id]`. Открывается из: «Ответить ›» на `TaskTile`, тапа по карточке в панели «Сообщения», тапа по мысли маскота. Пульс под шторкой не размонтируется: стопка и состояние маскота сохраняются (проверить, что `usePulseBoard` не перезапрашивается при открытии).
2. Карточка панели «Сообщения» (директор): хвост до **трёх** последних реплик треда (данные — `useTaskMessages(taskId)` с `enabled` только для развёрнутых карточек, не для всех сразу) и число непрочитанных; под хвостом строка ответа: поле + микрофон с удержанием (тот же `Composer` в `inline`-режиме) + чип «Прочитал». Отправка ответа двигает курсор (как сейчас).
3. Лента сотрудника: карточка в панели «Сообщения» симметрична — микрофон **первым**, поле вторым; «Прочитал» остаётся.
4. Границы (зафиксировать комментарием в `ThreadSheet`): чат только внутри задачи; «печатает» не делаем; реакции — после гейта D-40; у сотрудника на карточке по-прежнему три кнопки — ввод живёт в треде и в строке ответа, четвёртой кнопки нет.
5. `docs/FRONTEND.md`: по одному абзацу в «Пульс» и «Лента» — тред открывается шторкой, ответ на карточке.

### Проверки (обязательные, машинные)
```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
# в отдельном терминале: pnpm dev
pnpm smoke:ui
pnpm smoke:jank
```

### Definition of Done (D)
- [ ] Шаги 1–5, проверки зелёные.
- [ ] Телефон (эмуляция iPhone SE и Android 390 px): открыть тред из панели «Сообщения», ответить голосом, закрыть — маскот и шарики в том же состоянии, что до открытия.
- [ ] Коммиты, WORKLOG (`011D thread-sheet`), отчёт в чат.

---

## 6. Фаза A — сводка треда на `tasks` (ОТЛОЖЕНА, не исполнять без отдельного наряда)

Денормализация: `last_msg_seq/at/sender/kind/preview`, `open_question_id/at/text`, `decline_reason_text` на `tasks`, поддерживаются триггером на `task_messages`. Даёт доску одним плоским запросом и снимает второй канал Realtime с Пульса. Цена — UPDATE `tasks` на каждое сообщение и новый источник расхождений.

**Условие запуска**: замер на dev с посевом 200 задач × 15 сообщений показывает p95 `fetchBoard` > 400 мс **или** `smoke:board` фиксирует деградацию задержки «событие → плитка» после фаз B–C. Пока замера нет — не строим.

Если строить — обязательные ограничения (иначе рекурсия и утечки): триггер сводки игнорирует `status_change`/`system` и не трогает `tasks`, если поля не изменились (`is distinct from`); `trg_task_status_message` пишет system-строку по UPDATE `tasks` — цикл должен обрываться на этом условии; RLS `tasks_select` уже ограничена участниками, поэтому превью не расширяет видимость; `*_seen_seq` на `tasks` **не вводить** (ревизия D-61 — только по вопросу 2 владельцу).

---

## 7. Вопросы владельцу (не блокируют E–D; исполнитель работает по «По умолчанию»)

| # | Вопрос | По умолчанию в этом наряде |
|---|---|---|
| 1 | Показывать ли сотруднику ✓✓ «директор прочитал»? | Нет. Квитанции читает директор (принцип 8). Включение — один хук в `TaskChat`, отдельный мини-наряд. |
| 2 | Тихие часы для сообщений директору ночью (= D-51 п.2)? | Не держатся, уходят сразу — как `question` и `pending_review` сегодня. |
| 3 | Объём до пилота | E + B + C до пилота; D — после первых дней пилота. Сотрудники на стройке отчитываются голосом — это ядро, не полировка. |
| 4 | Фаза A (денормализация) | По замеру, §6. |

## 8. Черновик записи в DECISIONS.md (архитектор вносит при старте E как D-64)

**D-64. Сообщения в задачах: одно событие `message` с квитанциями, тред-мессенджер, отчёт внутри перехода** — (1) Любое сообщение участника треда (текст/фото/голос, кроме причины отказа, комментария доработки и отчёта) рождает outbox-событие `message` всем участникам, кроме отправителя; события `question`/`reply` упразднены; подряд идущие сообщения схлопываются в одну строку, пока она `queued` («N новых сообщения · последние слова»); сообщение сотруднику ждёт окна доставки, директору — уходит сразу (до решения D-51 п.2). (2) Курсор прочтения двигает только RPC `mark_thread_read` (монотонно, `greatest`), он же закрывает квитанции сообщений (`acted_at`); «Прочитал» доступен из шторки уведомления. Квитанцию видит директор: «не открывал с HH:MM / увидел / прочитал»; сотруднику ✓✓ не показывается (вопрос владельцу). (3) Отчёт при сдаче — часть `transition_task` (`payload.report`), одна транзакция, `meta.report`. (4) Тред — единая лента (сообщения + системные строки), голос и фото из композера, голосовое сохраняется до STT и транскрипт дописывается роутом `transcribe`; хвост 50 + «Показать раньше». (5) Директор открывает тред шторкой поверх Пульса. (6) Границы: чат только внутри задачи, без личных/групповых чатов, без «печатает», реакции — после D-40. (7) Денормализация сводки треда на `tasks` — отложена до замера.
