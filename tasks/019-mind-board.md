# tasks/019-mind-board.md — «Доски»: пункты голосом в «Заметках», доска на стене

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропуск = наряд не выполнен). Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай.

> Источник: владелец (2026-09-23): «модуль Mind Board для директора: с помощью модуля заметок он создаёт доску, в которой может продиктовать пункты, она сохранится как доска, потом эту доску можно вывести на экран ТВ». На разбор с пятью вопросами — «пусть будет доской. диктовка одно нажатие. остальное как сам рекомендуешь». Решение — **D-102**.

Наряд состоит из **трёх фаз = трёх сессий**: A (база) → B (телефон) → C (стена и пульт). Каждая фаза — своя ветка от вершины предыдущей, своя запись в WORKLOG и свой отчёт. Следующую фазу начинать только после приёмки предыдущей.

---

## 0. Решения, на которых стоит наряд (D-102; исполнителю — к сведению, не обсуждать)

1. **Доска — контейнер `mind_boards`, пункт — строка `notes`** с `board_id`, `position`, `done_at`. Вся механика заметки (голос до ИИ, очередь без сети, распознавание по `note_id`, «Поручить», корзина) достаётся пункту даром. Приватность — по автору.
2. **Диктовка: одно нажатие = один пункт, дословно, без парсера.** Промпты, схема парсера и few-shot не трогаются.
3. **Телефон:** вкладка «Доски» в «Заметках» (Мысли / Доски / В деле / Корзина), экран доски `/notes/b/[id]` на языке «Задач». Пункты досок не попадают в «Мысли», «В деле» и счётчики.
4. **Стена:** пятая заставка `scene = 'board'` + `tv_state.board_id`. Ставит только `tv_control(p_board)` и только автор. Киоск читает `tv_board(p_guest)` и ничего больше.
5. **Живьём:** правка доски на стене поднимает версию `tv_state` (`tv_touch`).
6. **Срок:** `board_until` = сегодняшние 21:00 Актобе; после 21:00 — `now() + 2 h`. Пока доска жива, ночь её не гасит.
7. **Гость:** доска прячется; «Показать гостю» (`board_guest`) сбрасывается новой доской и выключением гостя.
8. **Слова в UI:** «Доска», «Доски», «пункт», «Отметить», «на стену». В коде и схеме — `mind_boards`, `lib/mindboard`, `components/mindboard`: «board» без приставки в этом репозитории — доска Пульса (`lib/pulse/board.ts`, `smoke:board`).

---

## Контекст (читать только это, общий для всех фаз)

- `CLAUDE.md`: принципы 4–9; регламент п.1, п.4, п.6, п.7.
- `DECISIONS.md`: **D-102 целиком**; D-75 §3, §5; D-95 §2, §4; D-76 §1–3, §8; D-96 §5, §6, §8; D-98 §3; D-33 (строка «Решение»).
- Остальные файлы — перечислены в каждой фазе; читать по мере шагов, не заранее.
- **Где работать.** В `Z:\Pulse` одновременно живут несколько сессий, чекаут переключают под ногами. Работай в своём worktree: `git worktree add Z:\Pulse-019 -b feat/019a-mind-board-db main`, затем **свой** `pnpm install` в `Z:\Pulse-019` (не junction на `Z:\Pulse\node_modules`). `.env.local` скопировать из `Z:\Pulse`. Перед каждым коммитом: `git branch --show-current` должна быть твоей веткой, в том же `&&`: `test "$(git branch --show-current)" = feat/019… && git commit …`. `git add` только по путям из скоупа фазы.
- **Dev-база общая с владельцем.** Применять миграцию на dev и регенерировать типы — только после явного «да» владельца в чате (спроси в отчёте фазы A, сам не пушь). Перед `supabase db push` — `supabase migration list --linked`: пушить, только если в ожидающих ровно твоя миграция; иначе стоп и вопрос в отчёт.
- Комментарии в коде — английский; тексты UI — русский, без местоимений рода.

---

## Фаза A — база: `mind_boards`, пункты в `notes`, стена (одна сессия)

### Ветка и скоуп
- Ветка: `feat/019a-mind-board-db` от `main`.
- Трогать только: новую миграцию `supabase/migrations/<ts>_mind_boards.sql`, `supabase/tests/025_mind_boards.test.sql`, `lib/supabase/types.ts`.
- Имя миграции: `20260924090000_mind_boards.sql`. **Проверь**, что это позже каждого файла в `supabase/migrations` (в том числе чужих неотслеживаемых в `Z:\Pulse`) и каждой версии в `supabase migration list --linked`; если нет — возьми время позже всех.

### Читать
`supabase/migrations/20260917200000_notes.sql` (таблица, RLS, realtime-guard); `supabase/migrations/20260923205000_notes_reminders_trash.sql` (строки 91–111: `notes_purge_trash`, гранты); `supabase/migrations/20260923230000_tv_wall_v2.sql` (строки 36–75: снятие check-ограничения сцены, `tv_guest_on`; `tv_focus` — образец чтения задач и имени); `supabase/migrations/20260923230100_visits.sql` (строки 80–112: `tv_touch`); `supabase/migrations/20260923233000_tv_calendar_month.sql` (весь: drop + create `tv_control`, гранты); `supabase/tests/024_tv_calendar_month.test.sql` (образец pgTAP и фикстуры: директор `…0001`, киоск `…0004`, Марат `…0007`).

### Шаги
Миграция — один файл, шапка-комментарий по-русски в стиле соседних («Зачем …»: зачем пункт — заметка, зачем заставка, а не режим, зачем срок до 21:00, зачем прятать при госте).

1. **`mind_boards`**: `id uuid pk default gen_random_uuid()`, `company_id uuid not null references companies`, `user_id uuid not null references profiles`, `title text not null check (char_length(btrim(title)) between 1 and 120)`, `deleted_at timestamptz`, `client_request_id uuid`, `created_at`/`updated_at timestamptz not null default now()`. Триггер `moddatetime(updated_at)`. Индексы: `(user_id, updated_at desc) where deleted_at is null`; уникальный `(client_request_id) where client_request_id is not null`; `(deleted_at) where deleted_at is not null`. RLS — четыре политики **точь-в-точь как у `notes`** (компания и автор). Realtime — тем же guard-блоком, что у `notes`. `comment on table`.
2. **`notes`**: `add column board_id uuid references mind_boards on delete cascade`, `add column position double precision`, `add column done_at timestamptz`; check `notes_board_position_check (board_id is null or position is not null)`; индекс `(board_id, position) where board_id is not null`. **Пересоздать `notes_insert` и `notes_update`** (drop policy + create), добавив к прежнему условию в `with check`: `and (board_id is null or exists (select 1 from mind_boards b where b.id = board_id and b.user_id = (select auth.uid()) and b.company_id = (select auth_company_id())))` — чужой доске пункт не подсунуть.
3. **`tv_state`**: `add column board_id uuid references mind_boards on delete set null`, `add column board_until timestamptz`, `add column board_guest boolean not null default false`. Check-ограничение сцены снять тем же циклом, что в `tv_wall_v2` (строки 40–51), и поставить `tv_state_scene_check check (scene in ('face','clock','team','calendar','board'))`. `comment on column` для трёх полей.
4. **`tv_control`**: `drop function tv_control(text, uuid, uuid, text, boolean, boolean, text, text);` и `create function` с прежними параметрами плюс `p_board uuid default null`, `p_board_guest boolean default null`. Тело — прежнее (скопировать из `20260923233000`), с добавками:
   - `p_scene = 'board'` → `raise exception 'bad_scene'` (доску ставит только `p_board`); `p_board` вместе с `p_scene` → тоже `bad_scene`.
   - `p_board` не null: доска существует, `company_id = v_company`, `user_id = auth.uid()`, `deleted_at is null` — иначе `raise exception 'bad_board'`. Тогда `scene = 'board'`, `board_id = p_board`, `board_guest = false`, `board_until` = если `extract(hour from now() at time zone 'Asia/Aqtobe') < 21` то `((now() at time zone 'Asia/Aqtobe')::date + time '21:00') at time zone 'Asia/Aqtobe'`, иначе `now() + interval '2 hours'`.
   - `p_scene` не null (любая другая сцена): `board_id = null`, `board_until = null`, `board_guest = false`.
   - `p_guest = false`: `board_guest = false`. `p_board_guest` не null: `board_guest = p_board_guest`.
   - Версия поднимается, как и прежде, на каждой команде. `revoke … from public, anon` и `grant … to authenticated, service_role` — с новой сигнатурой из десяти типов.
5. **`tv_board(p_guest boolean default false) returns jsonb`**, `security definer`, `set search_path = public`, `stable`. Роль не `tv` и не `director` → `forbidden`. Читает строку `tv_state` своей компании. Возвращает `{"board": null, "hidden": false}`, если `scene <> 'board'`, или `board_id` пуст, или `board_until <= now()`, или доска удалена. Гость = `p_guest or tv_guest_on(state)`; если гость и не `board_guest` → `{"board": null, "hidden": true}`. Иначе `{"board": {...}, "hidden": false}`, где доска: `id`, `title`, `total` (живые пункты), `done` (с `done_at`), `updated_at`, `items` — живые пункты с непустым `btrim(text)`, по `position, created_at`: `id`, `text`, `done` (bool), `created_at`, `assignee` (имя без фамилии исполнителя `converted_task_id`, если задача не `revoked` и доску не показывают гостю; иначе null), `handed_done` (задача в `done`).
6. **Живьём:** функция-триггер `mind_board_touch_tv()` (`security definer`) — `after insert or update or delete on notes for each row` (когда `coalesce(new.board_id, old.board_id)` не null) и `after update on mind_boards for each row`: если у компании строка `tv_state` со `scene = 'board'` и `board_id` = эта доска — `perform tv_touch(<company>)`.
7. **Корзина:** `create or replace function notes_purge_trash` — прежнее тело плюс `delete from mind_boards b where b.deleted_at is not null and b.deleted_at < p_now - interval '3 days'` (пункты уходят каскадом); счётчик — сумма двух удалений. Гранты повторить.
8. **pgTAP `025_mind_boards.test.sql`** (`begin … rollback`, тесты только на своих строках, не считать чужие — dev не пустой). Проверить:
   - директор создаёт доску и пункт `(board_id, position 1)` — живут;
   - Марат: `mind_boards` 0 строк, пункт директора не видит, вставка заметки с `board_id` директора падает (RLS);
   - киоск: `mind_boards` и `notes` — 0 строк;
   - `tv_control(p_board => …)`: сцена `board`, `board_id`, `board_until > now()`; Марат — `forbidden`; `p_scene => 'board'` — `bad_scene`; чужая/удалённая доска — `bad_board`;
   - киоск `tv_board(false)`: название и один пункт; `tv_board(true)`: `hidden = true`; после `tv_control(p_board_guest => true)` — пункты есть, `assignee` null;
   - вставка пункта в доску на стене поднимает `tv_state.version`;
   - `tv_control(p_scene => 'clock')` обнуляет `board_id`;
   - мягко удалённая доска → `tv_board` отдаёт `board: null`;
   - от `postgres`: `notes_purge_trash(now() + interval '4 days')` удаляет удалённую доску вместе с её пунктами.
9. **Типы.** После «да» владельца и применения на dev — `pnpm db:types`. Без применения — вписать руками в `lib/supabase/types.ts`: таблицу `mind_boards` (Row/Insert/Update/Relationships по образцу `notes`), три колонки `notes`, три колонки `tv_state`, новые аргументы `tv_control`, функцию `tv_board` (`Returns: Json`). Отметь в WORKLOG, что типы ручные.
10. **Прогон pgTAP.** `pnpm test:rls` (нужен Docker Desktop). Без Docker — на dev через Management API: `POST https://api.supabase.com/v1/projects/qobsbjugromdwfdodwwa/database/query` с `Authorization: Bearer $SUPABASE_ACCESS_TOKEN`, тело `{ "query": <текст> }`. Файл выполняется внутри своего `begin … rollback`, ничего не сохраняется, но endpoint отдаёт только последний набор строк. Поэтому гоняй копию файла из песочницы сессии: после `begin;` — `create temp table tap_out (n serial, line text); grant all on tap_out, tap_out_n_seq to authenticated;`, каждый верхнеуровневый `select is|ok|throws_ok|lives_ok(` → `insert into tap_out (line) select …(`, а вместо `select * from finish(); rollback;` — `select json_build_object('failed', num_failed(), 'lines', (select json_agg(line order by n) from tap_out)); rollback;`. Если миграция A на dev ещё не применена, вставь её текст в копию сразу после `begin;`. Не удалось прогнать — так и написать в отчёте.

### Проверки (обязательные, машинные)
```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:rls          # или прогон 025 на dev через query-endpoint — вывод в отчёт
supabase migration list --linked   # вывод в отчёт; push — только после «да» владельца
```

### Definition of Done
- [ ] Миграция и pgTAP написаны; pgTAP прогнан (или честно: не прогнан и почему).
- [ ] Проверки зелёные; коммит `feat(db): доски — mind_boards, пункты-заметки, заставка «Доска» на стене (D-102)` с подписью `Co-Authored-By` своей модели.
- [ ] WORKLOG: `## 2026-MM-DD — Исполнитель (Opus) — 019A mind-board-db` + Сделано / Коммиты / Вопросы (в т.ч. «применить миграцию на dev?»).
- [ ] Отчёт в чат: проверки кратко, открытые вопросы.

---

## Фаза B — телефон: вкладка «Доски», экран доски, диктовка пунктов (одна сессия)

### Ветка и скоуп
- Ветка: `feat/019b-mind-board-phone` от вершины `feat/019a-mind-board-db`. Миграция A должна быть на dev (иначе стоп — без неё экран не проверить).
- Трогать только: `lib/mindboard/` (новый), `components/mindboard/` (новый), `app/(director)/notes/page.tsx`, `app/(director)/notes/b/[id]/page.tsx` и `loading.tsx` (новые), `lib/notes/queries.ts`, `lib/notes/list.ts`, `lib/notes/list.test.ts`, `lib/notes/mutations.ts`, `lib/notes/pending.ts`, `lib/notes/replay.ts`, `lib/notes/dictation.ts`, `components/notes/NoteCard.tsx`, `components/notes/NotesRecorder.tsx`, `components/ui/PageSkeletons.tsx` (только новый скелетон).

### Читать
`app/(director)/notes/page.tsx`; `components/notes/NoteCard.tsx`, `NotesRecorder.tsx`, `icons.tsx`; `lib/notes/queries.ts`, `mutations.ts`, `pending.ts`, `replay.ts`, `dictation.ts`, `list.ts`; `components/tasks/list/Tabs.tsx`, `components/tasks/list/TaskList.tsx` (`useAccordion`, `TaskColumn`); `components/calendar/CalendarOnWall.tsx` (образец кнопки «на стену»); `lib/tv/mutations.ts` (`useTvControl`), `lib/tv/queries.ts` (`useTvState`); `lib/store/ingest.ts` — только `startFromNote`.

### Шаги
1. **Пункты — в том же кеше заметок.** В `fetchNotes` (`lib/notes/queries.ts`) первый запрос получает `.is("board_id", null)`; добавить третий запрос — живые пункты досок (`board_id` не null, `deleted_at` null, `order position`, лимит `BOARD_POINTS_LIMIT = 1000`); корзина — как была (в ней и удалённые пункты). `useOlderNotes`, оба счётчика `useNoteCounts` и `useNoteSearch` — `.is("board_id", null)` (поиск по доскам — не в v1). Realtime-обработчик не меняется: пункт — обычная строка кеша, поэтому `upsertCached`, `patch`, `applyWords` работают без изменений.
2. **`splitNotes(notes, now?, liveBoards?)`** (`lib/notes/list.ts`): пункт (`board_id !== null`) никогда не попадает в `active`/`converted`; удалённый пункт — в `trash`, только если его доска в `liveBoards` (набор id живых досок); пункты удалённой доски не показываются вовсе — доску в корзине представляет её карточка. Тесты в `list.test.ts`.
3. **`lib/mindboard/queries.ts`**: тип `MindBoard` из `Database`; `boardKeys`; `useBoards(userId)` — `useRealtimeQuery` на `mind_boards` с фильтром `user_id=eq.…`, выборка: живые + удалённые не старше 3 дней, `order updated_at desc`, лимит 200.
4. **`lib/mindboard/list.ts`** (чистые функции, тесты в `list.test.ts`): `pointsOf(notes, boardId)` — живые по `position`, затем `created_at`; `boardSummary(points)` → `{ total, done, lastAt }`; `nextPosition(points)` → `max + 1` или `1`; `positionBetween(before, after)` → середина, края — `±1`; `defaultTitle(now)` → «Доска · 24 сент.» по Актобе; `boardOnWall(state, boardId, now)` — стоит ли эта доска на стене сейчас (`scene = 'board'`, тот же `board_id`, `board_until > now`).
5. **Создание доски без сети.** `lib/notes/pending.ts`: `DB_VERSION = 2`, новый store `boards` (`PendingBoard = { id, userId, companyId, crid, title, createdAt }`), функции `keepBoard` / `dropBoard` / `pendingBoards` по образцу creates. `lib/notes/replay.ts`: ожидающие доски доставляются **раньше** ожидающих пунктов. `lib/mindboard/mutations.ts`: `insertBoard(me, row)` — идемпотентно по `client_request_id`, как `insertNote` (23505 → перечитать); `useCreateBoard(me)` — id и ключ с клиента, оптимистично в кеш досок, в том же TanStack `scope` `{ id: "notes" }`, что заметки (пункт не обгонит доску); без сети — в IndexedDB, тост «Нет связи — доска на телефоне, отправлю сам». `useRenameBoard`, `useDeleteBoard` (мягко, `deleted_at`), `useRestoreBoard`, `usePurgeBoard` (жёстко, каскадом) — только онлайн: без сети откат и тост «Нет связи».
6. **Пункт — заметка с доской.** `PendingCreate` и `NewNote` получают `boardId: string | null` / `board_id`, `position: number | null` / `position` (старые записи IndexedDB без полей — null). `deliverCreate` передаёт их в `insertNote`. `useDictation(me, onReceipt, target?)`: `target = { boardId: string; nextPosition: () => number }` — пункт рождается с доской и позицией. `useCreateNote` принимает те же необязательные поля (пункт, набранный текстом). `NoteFields` += `done_at?: string | null`, `position?: number` — отметка и перестановка идут прежней очередью правок.
7. **Вкладка «Доски»** в `app/(director)/notes/page.tsx`: `NoteFilter` += `"boards"`, вкладки «Мысли / Доски / В деле / Корзина», число у «Досок» — живые доски. Во вкладке сверху карточка-кнопка «Новая доска» (+): `useCreateBoard` с `defaultTitle(now)` → `router.push('/notes/b/<id>')`. Ниже `BoardCard` (`components/mindboard/BoardCard.tsx`, рецепт `task-card`): название, «5 пунктов · 2 отмечено» (`pluralRu`), «● на стене», если `boardOnWall`. Пусто: «Досок пока нет» / «Соберите пункты к планёрке — и выведите на стену». Экран статуса наверху не меняется (он про «Мысли», D-93). **Корзина:** удалённые доски — `BoardTrashCard` («Доска «…» · 5 пунктов», «исчезнет сб 17:11», «Вернуть» / «Удалить навсегда» через ту же шторку-подтверждение); у удалённого пункта в `TrashCard` строка «из доски «…»»; «Очистить (N)» считает и чистит и доски. Проверить ширину 320 px: четыре вкладки в одну строку без переноса и обрезки; не влезает — стоп и скриншот в отчёт.
8. **Экран доски** `app/(director)/notes/b/[id]/page.tsx` + `loading.tsx` (`BoardSkeleton` в `PageSkeletons.tsx`), компоненты — в `components/mindboard/`:
   - **Шапка:** «‹ Заметки» (назад на `/notes?tab=boards`; вкладку читать из `?tab=`), дата, справа круглая кнопка `BoardOnWall` по образцу `CalendarOnWall`: не на стене → `tv_control({ board: id })`, тост «Доска на стене до 21:00» (время — из `board_until` ответа); на стене → `tv_control({ scene: "face" })`, тост «Доска убрана со стены». Аргумент `board` в `useTvControl` добавь минимально (тип + `p_board` в rpc); полный патч оптимистики — фаза C.
   - **Экран статуса = диктофон** (`BoardRecorder`: `NotesRecorder` получает необязательный проп текстов, или собрать из его частей — без копирования логики записи). Надзаголовок «Доска · только вам» / «Доска · на стене до 21:00»; название — крупно, тап превращает его в поле (Enter/blur — сохранить, пусто — вернуть прежнее); число пунктов со словом; строка «2 отмечено · последний 16:32»; пусто — «Зажмите микрофон и скажите первый пункт». Запись — «Пункт 6 · запись»; квитанция — «Записал · пункт 6». Поле «Написать пункт…» и круглый микрофон — как в «Заметках».
   - **Пункты** (`PointCard`, колонка + `useAccordion`): номер (индекс + 1), первая строка и остаток, значок голоса, пометка «→ Марат» у поручённого (задача — из `useSentTasks`, как `ConvertedCard`), отмеченный — приглушён с галочкой на месте. Тап раскрывает на месте: редактор с автосохранением (как у `NoteCard`: 600 мс + blur), голос и «Как было сказано», если есть; три кнопки: «Отметить» / «Снять отметку» (`done_at`), «Поручить» (`startFromNote(..., "task")`; недоступна у пустого и уже поручённого), «Удалить» (мягко, тост с «Отменить», как у заметок). Пункт без слов (идёт распознавание) — как в «Заметках».
   - **Порядок:** Framer Motion `Reorder.Group` / `Reorder.Item` с `dragListener={false}` и `useDragControls` на ручке-грипе; пока открыт пункт, ручки нет; на отпускании — одна правка `position = positionBetween(соседи)`.
   - **Внизу:** тихая кнопка «Удалить доску» → шторка-подтверждение → мягкое удаление, переход на `/notes?tab=boards`, тост «Доска в корзине» с «Вернуть».
   - Доски нет или она удалена — «Доски нет — возможно, удалена» и ссылка «К доскам».
9. Ничего не менять в `/pulse`, парсере, `/confirm`, на стене.

### Проверки (обязательные, машинные)
```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
Плюс ручной смоук в системном Chrome, эмуляция 390×844 и 320×568, скриншоты в отчёт: новая доска → три пункта голосом (`FAKE_MIC_WAV`, как в `scripts/smoke-notes.ts`) и один текстом → перестановка → «Отметить» → «Удалить» и «Вернуть» из корзины. Оффлайн (DevTools → Offline): новая доска + пункт голосом → онлайн → на сервере ровно одна доска и один пункт (прочитать service-клиентом). Перед смоуком на dev — проверь в `ai_logs`, не работает ли владелец прямо сейчас; чистить только свои строки.

### Definition of Done
- [ ] Шаги выполнены, проверки и смоук сделаны; коммиты мелкие (`feat(notes): …`, `feat(mindboard): …`) с подписью своей модели.
- [ ] WORKLOG: `## … — Исполнитель (Opus) — 019B mind-board-phone`.
- [ ] Отчёт: проверки, пути скриншотов, вопросы.

---

## Фаза C — стена и пульт: заставка «Доска», «Показать гостю» (одна сессия)

### Ветка и скоуп
- Ветка: `feat/019c-mind-board-wall` от вершины `feat/019b-mind-board-phone`.
- Трогать только: `lib/tv/state.ts` (+ `state.test.ts`), `lib/tv/board.ts` + `board.test.ts` (новые), `lib/tv/queries.ts`, `lib/tv/mutations.ts`, `lib/tv/remote.ts` (+ `remote.test.ts`), `components/tv/TvBoard.tsx` (новый), `components/tv/TvFrame.tsx`, `components/tv/TvScreen.tsx`, `components/tv/tv.module.css` (если нужно), `app/(director)/screen/page.tsx`, `app/dev/tv/WallSandbox.tsx`, `app/dev/tv/page.tsx`.

### Читать
`lib/tv/state.ts`, `lib/tv/queries.ts` (`useTvCalendar`, `useTvOverlay`), `lib/tv/mutations.ts`, `lib/tv/remote.ts`; `components/tv/TvScreen.tsx`, `TvFrame.tsx`, `TvCalendar.tsx` (образец сцены в `vh`); `app/(director)/screen/page.tsx`; `app/dev/tv/WallSandbox.tsx`; `lib/mindboard/queries.ts` (`useBoards` из фазы B).

### Шаги
1. **`lib/tv/state.ts`:** `TvScene` += `"board"`. `TV_SCENES` (четыре клавиши пульта) не трогать; добавить `WALL_SCENES = [...TV_SCENES, "board"]`. `sceneOf(state, now)` — сцена `board` только при живой доске (`board_id` и `board_until > now`), иначе `face`; обновить всех вызывающих. `boardLive(state, now)`; `boardUntilFrom(now)` — то же правило, что в SQL (до 21:00 Актобе — сегодняшние 21:00, иначе `+2 h`). Тесты: 20:59, 21:00, 07:30, 23:00; истёкшая доска → `face`; незнакомая сцена → `face`.
2. **`lib/tv/queries.ts`:** тип `TvBoard` (контракт `tv_board` из фазы A); `useTvBoard(guest, enabled)` → rpc `tv_board`, ключ `tvKeys.board(guest)`, `refetchInterval` 30 с, `useRealtimeInvalidate({ table: "tv_state" }, key, enabled)`.
3. **`lib/tv/board.ts`** (чистые, тесты): `boardLayout(count)` → до 6 — одна колонка, 7–14 — две, больше — страницы по 14; `pageAt(now, pages)` — страница по часам киоска, шаг 20 с; `isFresh(item, now)` — младше 60 с; `tagOf(item)` → «→ Марат», «→ Марат · сдано» или null.
4. **`components/tv/TvBoard.tsx`:** название крупно, «N пунктов · M отмечено»; пункты с номерами по `boardLayout`; отмеченный — приглушён, с галочкой, на своём месте; `tagOf` справа мелко; свежий — мягкое свечение (только opacity отдельного слоя; под `prefers-reduced-motion` — без анимации); страницы — «1 / 2» внизу сцены. `hidden` — часы (`TvClock`) и строка «Доска скрыта · гость в кабинете». Размеры — в `vh`. Движение — только `transform` и `opacity` (перф-контракт стены).
5. **`TvFrame` / `TvScreen`:** сцена `board` рисует `TvBoard`, ключ сцены `board:<id>`; `dim = night && !focus && !overlay.banner && scene !== "board"`. `TvScreen` зовёт `useTvBoard(guest, scene === "board")`. Если `tv_board` вернул `board: null` и не `hidden` — стена показывает лицо.
6. **`lib/tv/mutations.ts`:** `TvControlInput` += `board?: string`, `boardGuest?: boolean`; rpc — `p_board`, `p_board_guest`; оптимистичный `patch`: `board` → `scene: "board"`, `board_id`, `board_guest: false`, `board_until: boardUntilFrom(now)`; любая другая `scene` → три поля доски пустые; `guest: false` → `board_guest: false`; `boardGuest` → `board_guest`.
7. **Пульт `/screen`:** под швом «Календарь на стене» — шов «Доска на стене»: клавиши трёх последних живых досок (`useBoards`, по `updated_at`), горит стоящая на стене; тап — `show({ board: id }, "На стене — «…»")`; тап по горящей — `show({ scene: "face" }, "Доска убрана со стены")`. Досок нет — строка «Доски — в „Заметках“» ссылкой на `/notes?tab=boards`. Пока гость включён и доска на стене — ползунок «Показать гостю» (`Switch`, `boardGuest`). `wallNow` (`lib/tv/remote.ts`): «Доска «…» · до 21:00» (название доски пульт берёт из `useBoards`, передай списком как `people`); тест. `SCENE_LABEL`/`SCENE_HINT`/`SCENE_ICON` дополни `board` только настолько, насколько требует тип.
8. **Песочница `/dev/tv`:** фикстуры сцены «Доска»: 5 пунктов (два отмечены, один поручён, один свежий), 11 пунктов (две колонки), 20 пунктов (страницы), скрыта для гостя.

### Проверки (обязательные, машинные)
```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm smoke:tv
```
Плюс скриншоты `/dev/tv` 1920×1080 для четырёх фикстур и живой прогон на dev: киоск (`/tv` под ролью `tv`) + телефон директора: пункт голосом появляется на стене за ≤ 3 с; «Отметить» гаснет на стене; перезагрузка киоска доску не теряет; «Гость в кабинете» прячет доску, «Показать гостю» возвращает; «Лицо» с пульта убирает доску. Время в отчёт.

### Definition of Done
- [ ] Шаги выполнены, проверки зелёные, скриншоты и живой прогон в отчёте.
- [ ] Коммиты `feat(tv): …` с подписью своей модели; WORKLOG `… — 019C mind-board-wall`.
- [ ] Доки (FRONTEND, DATABASE, CLAUDE.md-структура) не трогать — их обновит архитектор при приёмке.
