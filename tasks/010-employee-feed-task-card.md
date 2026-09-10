# tasks/010-employee-feed-task-card.md — Сотрудник: лента задач, карточка с тремя кнопками, тред задачи; директор: приёмка кнопками и минимум «Требует вас»

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропускать нельзя). Семантическое ревью сделает отдельная сессия. Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай.

## Контекст (читать только это)
- `docs/FRONTEND.md`: «Экраны сотрудника» (Лента, таблица «Состояние задачи → набор кнопок», Мои дела), «State management» (пункт про `useRealtimeQuery` и курсор `seq` — целиком), «Пульс» — только блоки 1–2 с пометкой [ПИЛОТ] (вердикт и «Требует вас»).
- `docs/DESIGN.md` §2, §4 (тексты кнопок и пустых состояний).
- `docs/BACKEND.md` §7 (матрица переходов) и §2 контракт `/api/tasks/[id]/transition`, `/revoke`.
- `docs/DATABASE.md` — таблицы `tasks`, `task_messages` (поле `meta`: `is_question`, `answered_at`, `decline_reason`, `rework_comment`, `status_change`).
- Уже есть: `lib/supabase/client.ts`, `lib/supabase/types.ts`, оболочка `(employee)`/`(director)` из 006, роуты из 008, компоненты `components/ui/*` из 009 (Sheet, Chip, Button, Toast), `lib/ai/time.ts` (`formatAqtobe`).
- Решения: принцип 2 CLAUDE.md (три кнопки), принцип 3 (закрывает только директор), D-03 («Уточнить» — сообщение с `meta.is_question`), D-04 (`in_progress` не показывать), D-05 (сортировка стопок), D-01 (отзыв), G.20 («Настоять»). Realtime: подписки Supabase `postgres_changes` на `tasks` и `task_messages` (RLS применяется к событиям — таблицы нужно добавить в публикацию `supabase_realtime`: миграция `20260910120000_realtime_publication.sql` с `alter publication supabase_realtime add table tasks, task_messages` — единственная миграция этого наряда).
- Упрощения (архитектор): фото и голосовые в отчёте — следующий наряд (в этом — только текст); `<DeliveryStatus>` и `<OutboxBadge>` — с подсистемой доставки; Пульс-минимум — три списка без view `v_pulse_summary` (view — с полноценным Пульсом); аудио-плеер оригинала — простой `<audio controls>` по signed URL из нового роута `GET /api/voice/audio-url?path=` (director или assignee задачи, service-клиент `createSignedUrl(path, 600)`).
- Предусловия: 006–009 влиты в `main`.

## Ветка и скоуп
- Ветка: `feat/010-employee-feed-task-card` от `main`.
- Трогать только: `supabase/migrations/20260910120000_realtime_publication.sql`, `lib/realtime/useRealtimeQuery.ts` (+тест логики курсора), `lib/tasks/*` (запросы, мутации, тексты статусов), `components/tasks/*`, `app/(employee)/feed/page.tsx`, `app/(employee)/tasks/page.tsx`, `app/tasks/[id]/page.tsx` (тред, обе роли, layout с проверкой сессии), `app/(director)/pulse/page.tsx`, `app/api/voice/audio-url/route.ts`, `app/dev/task-card/page.tsx`, `WORKLOG.md`.

## Шаги
1. Миграция публикации Realtime (см. контекст) + `pnpm db:push` в dev (не reset — данные сохранить). `pnpm db:types` не требуется (схема таблиц не менялась).
2. `lib/realtime/useRealtimeQuery.ts` — **единственный** хук подписок: `useRealtimeQuery({ queryKey, queryFn, channel: { table, filter? }, onEvent })`: внутри `useQuery` + канал `supabase.channel(name).on('postgres_changes', { event:'*', schema:'public', table, filter }, payload => onEvent(payload, queryClient))`; на `visibilitychange → visible` и `online` — `refetch()` + `channel.unsubscribe()`/повторная подписка; `useEffect` cleanup. Для `task_messages` — догон по курсору: хук хранит `lastSeq`, при рефетче запрашивает `where seq > lastSeq` и дописывает в кеш (функция `mergeBySeq(existing, incoming)` — чистая, с тестом: дедуп по `id`, сортировка по `seq`).
3. `lib/tasks/queries.ts` — `useMyTasks()` (`tasks` под RLS: `status <> 'scheduled'` фильтр не нужен — RLS скрывает; сортировка: просроченные → по дедлайну → без срока; с полем `assignee`/`author` через join `profiles(full_name)`), `useTaskThread(taskId)` (задача + `task_messages` по `seq`), `useDirectorInbox()` (три списка: `pending_review`; открытые вопросы — задачи, у которых есть сообщение с `meta->>'is_question' = 'true'` и без `answered_at` (запрос по `task_messages` + join задачи); просрочки — `deadline < now()` и статус в `sent/accepted/rework`; сортировка стопок D-05: просрочки → вопросы → приёмка). `lib/tasks/mutations.ts` — `useTransition()` → `POST /api/tasks/{id}/transition` с `client_request_id = crypto.randomUUID()`, optimistic-обновление статуса в кеше (`setQueryData`) и откат при ошибке; `useSendMessage()` — insert в `task_messages` напрямую supabase-js под RLS (`type:'text'`, `meta`), optimistic; `useRevoke()` → `/revoke`. `lib/tasks/status-text.ts` — русские названия статусов и тексты кнопок (tone of voice DESIGN §4).
4. `components/tasks/TaskCard.tsx` — вариант `employee`: заголовок, чип дедлайна (красный при просрочке, «без срока»), приоритет `high` → «срочно», ▶️ плеер оригинала (если `source_audio_path`; signed URL по тапу через `/api/voice/audio-url`), транскрипт под спойлером «Что сказал директор»; кнопки по статусу — ровно таблица FRONTEND: `sent` → **Принял / Уточнить / Не могу**; `accepted` → **Выполнено**; `pending_review` → «На проверке у директора»; `rework` → плашка «Директор вернул задачу. Комментарий внутри» + кнопка **Выполнено** (авто-переход в accepted — сервер: `rework → accepted` делает клиент первым тапом «Принял» НЕ нужно; при `rework` кнопка «Выполнено» сначала шлёт `accepted`, затем `pending_review` — два вызова с разными `client_request_id`); `done` → ✓; `declined` → «Отказ: {причина}»; `revoked` → «Отозвано директором» (приглушённая карточка). «Уточнить» → шторка с полем → сообщение с `meta:{is_question:true}` и тост «Спросил. Директор ответит в треде». «Не могу» → шторка с чипами «Это не ко мне» / «Занят срочным» / «Буду позже: [дата]» + свободный текст → `transition declined` с `reason` (чип + текст). «Выполнено» → шторка «Что сделано?» с текстовым полем (необязательно) → сообщение (если текст) + `transition pending_review`. Вариант `director`: те же данные + кнопки по статусу: `pending_review` → **Принято / Доработка** (доработка — шторка с обязательным текстовым комментарием → `transition rework` с `comment`); `declined` → **Настоять** (`transition sent`) / **Отменить** (`revoke`); «Переназначить» — НЕ в этом наряде (кнопка отсутствует); любой нетерминальный → ссылка «Отозвать» (подтверждение) → `revoke`. Кнопки ≥44px, реакция мгновенная (optimistic), эффектов нет.
5. `app/(employee)/feed/page.tsx` — лента карточек через `useRealtimeQuery` (таблица `tasks`, фильтр по `assignee_id=eq.{uid}`), пустое состояние «Пока тихо. Появится задача — разбужу»; скелетон 3 карточек при загрузке. `app/(employee)/tasks/page.tsx` — «Мои дела»: только активные (`sent/accepted/rework/pending_review`), сортировка по срочности; тап → `/tasks/{id}`.
6. `app/tasks/[id]/page.tsx` — тред: карточка задачи сверху (вариант по роли), лента `task_messages` (текст; `status_change` — системная строка «Статус: Принял», `decline_reason`/`rework_comment` — помечены), композер снизу (текст, кнопка отправить; `padding-bottom: env(safe-area-inset-bottom)`); realtime на `task_messages` с фильтром `task_id=eq.{id}`; для директора ответ в композер закрывает вопрос (триггер БД) — в UI вопрос помечается «отвечено» после рефетча.
7. `app/(director)/pulse/page.tsx` — минимум: строка-вердикт (фон `--danger` если есть просрочки, `--warn` если есть вопросы/приёмка, иначе `--ok`; текст «{N} просрочек, {M} вопросов, {K} на приёмке» / «Всё спокойно»), затем три секции-списка карточек `TaskCard variant="director"` в порядке D-05. Данные — `useDirectorInbox()` + `useRealtimeQuery` на `tasks` (фильтр по компании не нужен — RLS). «Люди» и «Цифры недели» — не здесь.
8. `app/dev/task-card/page.tsx` — песочница: все статусы enum × оба варианта на фикстурах, кнопки логируют действие в консоль.

## Проверки (обязательные, машинные)
```powershell
pnpm db:push; supabase migration list --linked     # миграция публикации применена
pnpm typecheck
pnpm lint
pnpm test
pnpm build
# в отдельном терминале: pnpm dev
curl.exe -s -o NUL -w "%{http_code}\n" http://localhost:3000/dev/task-card    # 200
pnpm smoke:voice                                    # сквозной путь из 008 по-прежнему зелёный
```
Все должны завершиться успешно. Красная проверка = чинить в рамках скоупа, не расширяя его. Живая проверка «директор отправил → у сотрудника появилось без F5 → Принял → у директора обновилось» — владелец на двух устройствах/вкладках при приёмке.

## Definition of Done
- [ ] Шаги выполнены, проверки зелёные.
- [ ] Коммит(ы): conventional commits, мелкие; подпись `Co-Authored-By` — своей моделью исполнителя (не Fable).
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 010 employee-feed-task-card` + Сделано/Коммиты/Вопросы.
- [ ] Отчёт в чат: что сделано, вывод команд проверок (кратко), открытые вопросы. Файлы не пересказывать.
