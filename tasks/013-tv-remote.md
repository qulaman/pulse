# tasks/013-tv-remote.md — Пульт ТВ: сотрудник на стене с телефона директора, заставка, «Посетитель», квитанция экрана

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропускать нельзя). Семантическое ревью сделает отдельная сессия. Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай.

> Источник: заказ владельца (2026-09-18): «для директора создать страницу-пульт управления ТВ-киоском, чтобы он мог переключать на задачи сотрудника со своего телефона и мог изменить заставку». Анализ архитектора и решения — D-76. Этот файл — единственный текст наряда. Там, где docs/BACKEND.md §8 и docs/FRONTEND.md «ТВ-режим» говорят про `POST /api/tv/control` и private broadcast `tv_control`, прав D-76: состояние экрана — строка таблицы `tv_state`, команды — RPC.

Наряд состоит из **трёх фаз = трёх сессий и веток**: A (БД) → B (киоск) → C (пульт). Каждая фаза — отдельная запись в WORKLOG и отдельный отчёт; следующую фазу начинать только после приёмки предыдущей.

---

## 0. Решения, на которых стоит наряд (D-76; исполнителю — к сведению, не обсуждать)

1. **Состояние экрана — строка `tv_state` (одна на компанию), а не broadcast.** Киоск перезагружается каждую ночь и по деплою; эфемерная команда после перезагрузки теряется, а строка — нет. Киоск читает строку под RLS и слушает её через существующий `useRealtimeQuery` (postgres_changes) — новой realtime-инфраструктуры не появляется. Пульт видит ту же строку и поэтому всегда показывает, что на стене прямо сейчас.
2. **Команды — только RPC `tv_control` (security definer, роль `director`).** Политик на запись у `tv_state` нет вовсе. Роут `POST /api/tv/control` и service role не нужны: гарантия «сотрудник не командует экраном» обеспечена проверкой роли внутри функции.
3. **Команда — абсолютное состояние, не дельта.** Повтор той же команды даёт ту же строку, поэтому `client_request_id` не заводится (единственное сознательное исключение из принципа 7; пульт не ставит команды в оффлайн-очередь — без сети кнопка честно говорит «нет связи»).
4. **Режимы экрана в этом наряде: `ether` (эфир, как сейчас) и `employee` (сотрудник на стене).** `task`, «итоги недели», «сравнить двоих» — не строятся; схема допускает `task` заранее, чтобы не менять миграцию.
5. **Фокус живёт 10 минут** (`expires_at`, ставит RPC). Возврат в эфир — по часам киоска, без cron и без таймеров на пульте. Повторный тап по тому же сотруднику продлевает ещё на 10 минут.
6. **Данные для фокуса — RPC `tv_focus()`**, security definer для ролей `tv` и `director`: роль `tv` по-прежнему не читает ни `tasks`, ни `profiles`. Функция сама берёт `tv_state` компании и отдаёт свежие открытые дела сотрудника — если сотрудник принял задачу, пока стоит на стене, стена это покажет.
7. **Гость и негатив в фокусе.** Маска гостя (D-33) считается в БД: при `guest = true` `tv_focus` отдаёт имя без фамилии и не отдаёт заголовки (экран пишет «Поручение»). Негатив по именам на стену не выносится (D-45): в фокусе нет отказов, слово «просрочено» и красный цвет не показываются — срок печатается нейтрально, датой.
8. **«Заставка» = сцена эфира, когда фокуса нет**: `face` (лицо с репликой — как сейчас, по умолчанию), `clock` (крупные часы, дата, марка и название компании — тихий экран для совещаний), `team` (кто чем занят — плитки имён с числом дел из `tv_summary().load`, без просрочек). Бегущая строка, подпись и пульс дня остаются во всех сценах. Выбор сцены хранится в `tv_state.scene` и не истекает.
9. **Квитанция экрана (принцип 8 для ТВ).** Киоск раз в минуту и после каждого применённого состояния зовёт `tv_heartbeat(p_applied_version)`; пульт показывает «На стене» / «Отправлено, экран ещё не показал» / «Экран не отвечает с 9:14». Перезапуск экрана с пульта — `reload_requested_at` в той же строке.
10. **Вход директора:** Настройки → «Экран» (страница `/screen`), плюс кнопка «На экран» на карточке сотрудника — жест «сотрудник зашёл — я нажал — его дела на стене» (CONCEPT §9, демо-сцена продажи).

---

## Контекст (читать только это, общий для всех фаз)

- `CLAUDE.md`: принципы 6, 7 (и исключение §0 п.3), 8, 10; регламент п.4 (миграции), п.6 (время).
- `docs/FRONTEND.md` раздел «ТВ-режим» (только «Что построено» и «Маскот на стене» — чтобы знать композицию; абзацы про `tv_control`/broadcast устарели, прав D-76). `docs/DATABASE.md` абзац «tv_events» (что видит роль `tv`).
- Код, который трогаем (читать по мере шагов, не заранее): `supabase/migrations/20260917190000_tv_events.sql` (образец: `tv_emit` — маска гостя, `tv_summary` — проверка роли и `auth_company_id()`), `supabase/migrations/20260907150000_guards_and_tv_isolation.sql` (что роли `tv` запрещено), `supabase/migrations/20260910120000_realtime_publication.sql` (как добавлять таблицу в публикацию), `supabase/tests/001_rls_tasks.test.sql` (id демо-пользователей), `supabase/tests/018_notes.test.sql` (свежий образец pgTAP), `lib/tv/queries.ts`, `lib/tv/voice.ts`, `lib/tv/feed.ts`, `lib/tv/clock.ts`, `components/tv/*`, `app/tv/page.tsx`, `app/tv/layout.tsx`, `lib/realtime/useRealtimeQuery.ts` (`useRealtimeQuery`, `useRealtimeInvalidate`), `lib/brand.ts`, `components/brand/PulseMark.tsx`, `lib/people/queries.ts` (`usePeople`, `usePerson`, `initialsOf`), `lib/tasks/mutations.ts` (образец `useMutation` с optimistic-патчем и тостом), `app/(director)/people/[id]/page.tsx`, `app/(director)/settings/page.tsx` (`Row` + локальная иконка `GiftIcon` — образец), `components/ui/Row.tsx`, `components/ui/Chip.tsx`, `components/ui/Button.tsx`, `components/ui/Toast.tsx`, `components/ui/PageSkeletons.tsx`, `scripts/smoke-ui.ts` (образец скриншотов через Playwright).
- Решения: D-33 (маска гостя), D-45 (негатив по именам на стену не выносится; перф-контракт: анимации только transform/opacity), G.5 в редакции D-76, D-76 (этот наряд).
- Факты о среде: dev-проект Supabase `qobsbjugromdwfdodwwa`; `pnpm test:rls` требует Docker Desktop — если Docker нет, pgTAP не запускать, а в WORKLOG написать «pgTAP 013 не выполнялся (нет Docker)» и проверить миграцию скриптом (см. DoD). Рабочая копия одна на все сессии: **`git add` только по путям из скоупа фазы**, никогда `git add -A`; `lib/supabase/types.ts` после `pnpm db:types` коммитится целиком — это норма. Перед мутирующими смоуками на dev — проверить, что владелец не работает (`ai_logs` за последние 30 минут).
- Ветки — от **текущего HEAD** (не от `main`: `main` отстаёт). Старые миграции не править. Секретов в код не вносить. `db push` — только в dev.

---

## Фаза A — таблица `tv_state`, RLS, RPC `tv_control` / `tv_focus` / `tv_heartbeat` (одна сессия)

### Ветка и скоуп
- Ветка: `feat/013a-tv-state-db`.
- Трогать только: `supabase/migrations/20260918100000_tv_state.sql` (новая), `supabase/tests/019_tv_state.test.sql` (новый), `lib/supabase/types.ts` (через `pnpm db:types`), `scripts/db-clean.ts`, `lib/admin/reset-demo.ts`.

### Шаги
1. **Миграция `20260918100000_tv_state.sql`** (одна на фазу; шапка — по строке на пункт «зачем», ссылки на D-76, D-33, D-45):
   1. Таблица:
      ```sql
      create table tv_state (
        company_id          uuid primary key references companies,
        mode                text not null default 'ether'
                            check (mode in ('ether','employee','task')),
        employee_id         uuid references profiles on delete set null,
        task_id             uuid references tasks on delete set null,
        scene               text not null default 'face'
                            check (scene in ('face','clock','team')),
        guest               boolean not null default false,
        expires_at          timestamptz,            -- focus ends here; null = no focus
        version             int not null default 0, -- bumped by every tv_control; the kiosk acks it
        reload_requested_at timestamptz,
        seen_at             timestamptz,            -- kiosk heartbeat
        applied_version     int,                    -- last version the kiosk rendered
        updated_by          uuid references profiles,
        updated_at          timestamptz not null default now()
      );
      ```
      Комментарий к таблице: «one row per company: what the wall shows; written only by tv_control / tv_heartbeat (D-76)». Триггер `moddatetime(updated_at)` по образцу других таблиц.
   2. RLS: `enable row level security`; единственная политика `tv_state_select for select using (company_id = auth_company_id() and auth_role() in ('tv','director'))`. Политик insert/update/delete нет вовсе.
   3. Публикация Realtime: добавить `tv_state` в `supabase_realtime` тем же идемпотентным блоком, что в `20260910120000_realtime_publication.sql` (и в `20260917190000_tv_events.sql`).
   4. **`tv_control`** — `security definer set search_path = public`, `returns tv_state`:
      ```sql
      create or replace function tv_control(
        p_mode        text    default null,   -- null = unchanged
        p_employee_id uuid    default null,
        p_task_id     uuid    default null,
        p_scene       text    default null,   -- null = unchanged
        p_guest       boolean default null,   -- null = unchanged
        p_reload      boolean default false
      ) returns tv_state
      ```
      Логика: `auth_role() = 'director'` иначе `raise exception 'forbidden' using errcode = 'P0001'`; `v_company := auth_company_id()`. Если `p_mode = 'employee'`: `p_employee_id` обязателен, профиль должен быть в той же компании и `is_active` — иначе `raise exception 'bad_employee'`; `task_id := null`, `expires_at := now() + interval '10 minutes'`. Если `p_mode = 'task'`: `p_task_id` обязателен, задача той же компании — иначе `'bad_task'`; `employee_id := null`, `expires_at := now() + 10 min`. Если `p_mode = 'ether'`: `employee_id := null, task_id := null, expires_at := null`. Если `p_mode is null` — режим, цели и `expires_at` не трогаются. Любое другое значение `p_mode` — `'bad_mode'`. `p_scene` не из списка — `'bad_scene'`. Запись — `insert ... on conflict (company_id) do update set ...` с `version = tv_state.version + 1`, `updated_by = auth.uid()`, `reload_requested_at = case when p_reload then now() else tv_state.reload_requested_at end`; при вставке новой строки (`version = 1`). Функция возвращает итоговую строку (`returning *`).
   5. **`tv_focus()`** — `security definer set search_path = public`, `stable`, `returns jsonb`. Роль: `auth_role() in ('tv','director')`, иначе `'forbidden'`. Берёт строку `tv_state` компании; если её нет, `mode <> 'employee'`, `employee_id is null` или `expires_at <= now()` — возвращает `jsonb_build_object('mode','ether')`. Иначе:
      ```jsonc
      {
        "mode": "employee",
        "guest": <tv_state.guest>,
        "expires_at": <timestamptz>,
        "employee": { "id": uuid, "name": text, "position": text|null },
        "tasks": [ { "id": uuid, "title": text|null, "status": text, "deadline": timestamptz|null }, ... ]
      }
      ```
      `name` — `full_name`, при `guest` — `split_part(full_name,' ',1)` (та же маска, что в `tv_emit`). `tasks` — задачи `assignee_id = employee_id` со статусами `sent, accepted, in_progress, rework, pending_review` (`declined`, `scheduled` и закрытые — нет; D-45), `order by deadline nulls last, created_at`, `limit 8`; `title` при `guest` — `null`. Просрочку функция не помечает и не считает — экран печатает дату нейтрально.
   6. **`tv_heartbeat(p_applied_version int default null)`** — `security definer`, `returns void`. Роль строго `tv` (директор с ноутбука на `/tv` квитанцию не оставляет). `insert into tv_state (company_id, seen_at, applied_version) values (auth_company_id(), now(), p_applied_version) on conflict (company_id) do update set seen_at = now(), applied_version = coalesce(excluded.applied_version, tv_state.applied_version)`. Строку создаёт сама, если пульт ещё ни разу не командовал.
   7. `grant execute` на три функции — как у `tv_summary` в `20260917190000` (повторить ту же схему грантов/revoke, ничего нового не изобретать).
2. `pnpm db:push` в dev, затем `pnpm db:types`.
3. **`scripts/db-clean.ts`** и **`lib/admin/reset-demo.ts`**: `tv_state` — состояние, а не активность; при очистке демо строку **сбрасывать в эфир**, а не удалять: добавить в оба скрипта `update tv_state set mode='ether', employee_id=null, task_id=null, expires_at=null` (для `reset-demo` — тем же service-role клиентом, где чистятся таблицы активности; в список `ACTIVITY_TABLES` не добавлять).
4. **pgTAP `019_tv_state.test.sql`** (по образцу `018`; id директора, менеджера и сотрудника Марата — из `001_rls_tasks.test.sql`, id киоска роли `tv` — `10000000-0000-0000-0000-000000000004` из `supabase/seed.sql`; смена роли в тесте — тем же приёмом `request.jwt.claims`, что в `001`):
   1. директор: `select tv_control('employee', <marat>)` → строка `mode = 'employee'`, `employee_id = <marat>`, `expires_at` в интервале `now() + 9..11 min`, `version = 1`;
   2. директор: `select tv_control(null, null, null, 'clock', true)` → `scene = 'clock'`, `guest = true`, `mode` по-прежнему `'employee'`, `expires_at` не изменился, `version = 2`;
   3. `tv`: `select count(*) from tv_state` = 1; сотрудник: = 0; менеджер: = 0;
   4. **негатив**: сотрудник вызывает `tv_control('ether')` → `throws_ok` `forbidden`; `tv` вызывает `tv_control('ether')` → `forbidden`; директор вызывает `tv_control('employee', <uuid чужой компании или несуществующий>)` → `bad_employee`; `tv_control('ether', null, null, 'disco')` → `bad_scene`;
   5. `tv`: `tv_focus()` → `mode = 'employee'`, `employee->>'name'` без пробела (гость — имя без фамилии), у всех `tasks[*]->>'title'` — null, число `tasks` равно числу открытых задач Марата в фикстуре (создать одну задачу Марату в `sent` тем же способом, что в `001`, если фикстура пуста);
   6. директор: `tv_control(null, null, null, null, false)` → `guest = false`; `tv`: `tv_focus()` → у первой задачи `title` не null, `name` с фамилией;
   7. `tv`: `select tv_heartbeat(3)` → `applied_version = 3`, `seen_at` не null; сотрудник: `tv_heartbeat(3)` → `forbidden`; директор: `tv_heartbeat(3)` → `forbidden`;
   8. директор: `tv_control('ether')` → `employee_id` null, `expires_at` null, `version = 4`; `tv`: `tv_focus()->>'mode' = 'ether'`;
   9. `tv`: `update tv_state set guest = true` → 0 строк (нет политики); `delete from tv_state` → 0 строк.

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
- [ ] Если Docker нет: миграция проверена скриптом на dev (по образцу `scripts/smoke-tv.ts`: логин директора → `tv_control('employee', <id>)`; логин `tv` → `tv_focus()` отдаёт задачи, `tv_heartbeat(1)` проходит; логин сотрудника → `select` из `tv_state` пуст, `tv_control` падает `forbidden`) — команда и вывод в отчёт; после проверки вернуть строку в эфир.
- [ ] Коммиты: conventional commits, мелкие; `Co-Authored-By` — своей моделью исполнителя.
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 013A tv-state-db` + Сделано/Коммиты/Вопросы.
- [ ] Отчёт в чат: что сделано, вывод проверок (кратко), открытые вопросы.

---

## Фаза B — киоск слушает `tv_state`: фокус на сотруднике, сцены заставки, гость, квитанция, перезапуск (одна сессия)

### Ветка и скоуп
- Ветка: `feat/013b-tv-kiosk-state`.
- Трогать только: `lib/tv/queries.ts`, `lib/tv/state.ts` + `lib/tv/state.test.ts` (новые), `lib/tv/focus.ts` + `lib/tv/focus.test.ts` (новые), `components/tv/TvScreen.tsx`, `components/tv/TvFocus.tsx` (новый), `components/tv/TvClock.tsx` (новый), `components/tv/TvTeam.tsx` (новый), `components/tv/useKiosk.ts`, `app/tv/page.tsx`, `app/tv/layout.tsx`.

### Шаги
1. **`lib/tv/queries.ts`**:
   - тип `TvState = Database["public"]["Tables"]["tv_state"]["Row"]`; ключ `tvKeys.state = ["tv","state"]`; хук `useTvState()` на `useRealtimeQuery<TvState | null>`: `select * from tv_state limit 1` (`maybeSingle`; RLS отдаёт строку своей компании), канал `{ table: "tv_state" }`, обработчик по умолчанию (invalidate);
   - тип `TvFocus` по контракту `tv_focus()` из фазы A (`mode: "ether"` | `{ mode: "employee", guest, expires_at, employee, tasks }`); ключ `tvKeys.focus`; хук `useTvFocus(enabled: boolean)` на `useQuery` с `refetchInterval: 30_000` (страховка) + `useRealtimeInvalidate({ table: "tv_events" }, tvKeys.focus, enabled)` (принял/сдал задачу — стена обновилась) + `useRealtimeInvalidate({ table: "tv_state" }, tvKeys.focus, enabled)` (смена цели фокуса).
2. **`lib/tv/state.ts`** (чистые функции + тесты, без React):
   - `effectiveMode(state: TvState | null, now: Date): "ether" | "employee"` — `employee` только если `mode = 'employee'`, `employee_id` не null и `expires_at > now`; всё остальное — `ether` (режим `task` пока тоже `ether`);
   - `guestOf(state: TvState | null, initial: boolean): boolean` — строки нет → стартовый `?guest=1`, строка есть → `state.guest`;
   - `sceneOf(state): "face" | "clock" | "team"` — неизвестное значение → `face`;
   - `shouldReload(state, bootedAt: Date): boolean` — `reload_requested_at` позже времени загрузки страницы;
   - `focusRemainingMs(state, now): number`.
   Тесты: по одному-двум случаям на функцию, включая истёкший фокус и отсутствие строки.
3. **`lib/tv/focus.ts`** (чистые функции + тесты): `focusRows(focus: TvFocusEmployee, now: Date): FocusRow[]`, где `FocusRow = { id, title: string, status: string, deadline: string | null, tone: "accent" | "ok" | "muted" }`: `title` — заголовок или «Поручение» (гость / null); `status` — `sent → «новая»`, `accepted | in_progress | rework → «в работе»`, `pending_review → «на проверке»` (слова из `SHORT_STATUS` в `lib/tasks/status-text.ts`, но `rework` намеренно печатается как «в работе» — D-45); `deadline` — «сегодня 18:00» / «завтра» / «до 22 сен» через `tvDate`/`tvTime` из `lib/tv/clock.ts` — **без слова «просрочено» и без тона `danger` ни при каком сроке** (тест на задачу с прошедшим сроком: `tone !== "danger"`, текст без «просроч»); `tone`: `sent → accent`, `в работе → ok`, `на проверке → muted`.
4. **`components/tv/TvFocus.tsx`** — сотрудник на стене, занимает `<main>` вместо лица: слева маленькое лицо (`Mascot` 12vh через `useVhPx`, состояние `speaking`), рядом имя `text-[7vh] font-bold` и должность `text-[3vh] text-muted`; под ними список до 6 строк `FocusRow`: заголовок `text-[3.6vh]` (одна строка, `truncate`), справа чип статуса и срок `text-muted`; тон — цветом чипа (`var(--accent)` / `var(--ok)` / `var(--text-muted)`). Если дел нет — одна строка «Свободен: открытых дел нет». Внизу блока мелко «на экране ещё N мин» (из `focusRemainingMs`, обновляется с `useClock`). Без рамок и теней — как остальной экран.
5. **`components/tv/TvClock.tsx`** — сцена «часы»: время `text-[22vh] font-bold tabular-nums`, под ним дата `text-[4vh] text-muted first-letter:uppercase`, ниже марка (`PulseMark size="tv"`), название компании и (если есть) логотип `logoUrl` высотой 8vh. Часы — те же `tvTime`/`tvDate` и `useClock`.
6. **`components/tv/TvTeam.tsx`** — сцена «команда»: плитки из `summary.load` (уже с маской гостя из БД), сортировка `active desc, name`, до 24 плиток сеткой 6×4 (`grid-cols-6`, размеры в `vh`): имя `text-[3vh]`, под ним «3 дела» / «свободен» (`pluralRu` из `lib/tasks/status-text.ts`); точка слева: `var(--ok)` при `active > 0`, `var(--text-muted)` иначе. **Поле `overdue` не используется и не отображается** (D-45). Если очки включены (`summary.points_enabled`) и не гость — у первых трёх из `summary.rating` мелкий золотой ярлык «1», «2», «3».
7. **`components/tv/TvScreen.tsx`**: пропсы `{ company, guest: initialGuest, logoUrl, role }`; внутри `const state = useTvState(); const mode = effectiveMode(state.data, now); const guest = guestOf(state.data, initialGuest); const scene = sceneOf(state.data); const focus = useTvFocus(mode === "employee");`. `<main>` рендерит через `AnimatePresence mode="wait"` один из: `TvFocus` (когда `mode === "employee"` и `focus.data?.mode === "employee"`), иначе по `scene`: `TvMascot` / `TvClock` / `TvTeam`; переход — `opacity 0→1, y 24→0`, 500 мс, `ease [0.2,0,0,1]`; под `prefers-reduced-motion` — без движения. Подпись внизу: при фокусе добавить `· на экране: {имя}`; при `guest` — существующее «режим посетителя». Сводка `useTvSummary(guest)` — с новым `guest`.
8. **`components/tv/useKiosk.ts`**: (а) `useHeartbeat(role: string, appliedVersion: number | null)` — только при `role === "tv"`: вызов `supabase.rpc("tv_heartbeat", { p_applied_version })` при монтировании, при каждом изменении `appliedVersion` и раз в 60 с; ошибки — в `console.warn`, экран не трогать; (б) `useRemoteReload(state: TvState | null)` — `bootedAt` в `useRef(new Date())`, при `shouldReload` → `window.location.reload()`. Оба вызвать из `TvScreen` (`appliedVersion = state.data?.version ?? null`).
9. **`app/tv/page.tsx` / `app/tv/layout.tsx`**: страница передаёт `logoUrl = brand.logoUrl` и `role = profile.role` (профиль уже читается в layout — передать через `children`-пропс нельзя, поэтому прочитать `getSessionProfile()` ещё раз в `page.tsx` тем же `try/redirect`, что в layout; дублирование двух строк допустимо). `?guest=1` остаётся стартовым значением до прихода строки.
10. **Ручная проверка на dev** (`pnpm dev`, два окна Chrome: киоск под демо-логином `tv`, директор — через SQL/скрипт фазы A или `supabase.rpc('tv_control', …)` из консоли под директором): (а) `tv_control('employee', <Марат>)` → на стене за ≤ 3 с появляется карточка Марата с его делами; (б) Марат принимает задачу → строка на стене меняет чип на «в работе» без перезагрузки; (в) `tv_control(null,null,null,'clock')` → после возврата в эфир (`tv_control('ether')`) стена показывает часы; `'team'` → плитки; `'face'` → лицо; (г) `guest = true` → в фокусе имя без фамилии, «Поручение» вместо заголовков; (д) `p_reload => true` → киоск перезагрузился; (е) `select seen_at, applied_version from tv_state` — обновляются. Скриншоты стены (1920×1080) для фокуса и каждой из трёх сцен — по образцу `scripts/smoke-ui.ts` (Playwright, системный Chrome) или DevTools; пути — в отчёт.

### Проверки (обязательные, машинные)
```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
Все должны завершиться успешно. Красная проверка = чинить в рамках скоупа, не расширяя его.

### Definition of Done (B)
- [ ] Шаги 1–10 выполнены, проверки зелёные, четыре скриншота приложены.
- [ ] Ручная проверка (шаг 10) пройдена по всем шести пунктам; что не прошло — в отчёт, не чинить за пределами скоупа.
- [ ] Коммиты: conventional commits, мелкие; `Co-Authored-By` — своей моделью исполнителя.
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 013B tv-kiosk-state` + Сделано/Коммиты/Вопросы.
- [ ] Отчёт в чат: что сделано, вывод проверок (кратко), открытые вопросы.

---

## Фаза C — пульт директора `/screen`, «На экран» на карточке сотрудника, вход из настроек (одна сессия)

### Ветка и скоуп
- Ветка: `feat/013c-tv-remote`.
- Трогать только: `app/(director)/screen/page.tsx` (новая), `components/screen/*` (новые), `lib/tv/remote.ts` + `lib/tv/remote.test.ts` (новые), `lib/tv/mutations.ts` (новый), `app/(director)/settings/page.tsx`, `app/(director)/people/[id]/page.tsx`, `components/ui/PageSkeletons.tsx` (скелет страницы, если нужен).

### Шаги
1. **`lib/tv/mutations.ts`**: `useTvControl()` на `useMutation` по образцу `lib/tasks/mutations.ts`: вход `{ mode?: "ether" | "employee"; employeeId?: string; scene?: TvScene; guest?: boolean; reload?: boolean }` → `supabase.rpc("tv_control", { p_mode, p_employee_id, p_scene, p_guest, p_reload })`; optimistic-патч кэша `tvKeys.state` (режим/цель/сцена/гость и `expires_at = now + 10 мин` при фокусе), при ответе — `setQueryData` строкой из RPC, при ошибке — откат и тост «Нет связи с сервером, экран не переключён». Оффлайн-очереди нет намеренно (§0 п.3).
2. **`lib/tv/remote.ts`** (чистые функции + тесты): `wallReceipt(state: TvState | null, now: Date): { tone: "ok" | "warn" | "muted"; text: string }` — строки нет → `muted` «Экран ещё не подключался»; `seen_at` старше 3 мин → `warn` «Экран не отвечает с HH:MM» (`tvTime(seen_at)`); `applied_version < version` → `muted` «Отправлено, экран ещё не показал»; иначе `ok` «На стене». `wallNow(state, people, now): string` — что показывается: «Эфир · лицо» / «Эфир · часы» / «Эфир · команда» / «Марат Ахметов · ещё 7 мин» (имя из списка людей по `employee_id`; истёкший фокус = эфир). `SCENE_LABEL: Record<TvScene, string> = { face: "Лицо", clock: "Часы", team: "Команда" }`.
3. **Страница `app/(director)/screen/page.tsx`** (`"use client"`, заголовок «Экран в кабинете», подзаголовок «Пульт от телевизора: что сейчас на стене и что показать» — тон DESIGN §5, без рамок-в-рамках), данные: `useTvState()`, `usePeople()`, `useClock`-подобный тик раз в 10 с для «ещё N мин»:
   1. **«Сейчас на стене»** — карточка: крупно `wallNow(...)`, под ней строка `wallReceipt(...)` цветом тона; если фокус активен — кнопка `Button` «Вернуть эфир» (→ `mode: "ether"`), иначе кнопки нет;
   2. **«Показать сотрудника»** — поле поиска (как на `/people`, тот же `normalise`-подход: подстрока по имени/должности/алиасам) и список активных людей без роли `tv` (компонент `components/screen/PersonPick.tsx`): аватар-инициалы, имя, должность; тап → `useTvControl({ mode: "employee", employeeId })` + тост «На стене — Марат · 10 мин»; у того, кто сейчас на стене, — чип `accent` «на экране», повторный тап продлевает (тост «Ещё 10 минут»);
   3. **«Заставка»** — три чипа-сегмента `Chip` (`SCENE_LABEL`), активный — `tone="accent"`; тап → `{ scene }`; под чипами одна строка-пояснение выбранной сцены: «Лицо говорит о последних событиях» / «Тихие часы: для совещаний» / «Кто чем занят»;
   4. **«Посетитель»** — `Row` с переключателем (`onClick` → `{ guest: !guest }`), значение «включён: без фамилий, очков и названий» / «выключен»; при включённом — цвет `var(--warn)`;
   5. **«Перезапустить экран»** — `Row tone="danger"`? — нет: действие безвредное, обычный `Row` с `onClick` → `{ reload: true }` + тост «Экран перезапускается»; `busy` на время запроса;
   6. пустое состояние (строки `tv_state` нет и `seen_at` пуст): вместо «Сейчас на стене» — «Экран ещё не подключался. Войди на телевизоре под пользователем роли „ТВ-экран“» (пользователей роли `tv` директор создаёт на `/people`); остальные секции работают — команда создаст строку;
   7. всё рендерится при ширине 320 px без горизонтального скролла; цели тапа — 44 px; скелет до первой загрузки.
4. **`app/(director)/settings/page.tsx`**: в `RowGroup` после «Магазин» — `<Row icon={<TvIcon />} title="Экран" value="пульт от телевизора" href="/screen" />`; `TvIcon` — локальный контурный SVG 20×20 в стиле `GiftIcon` (прямоугольник экрана с ножкой).
5. **`app/(director)/people/[id]/page.tsx`**: рядом с существующими действиями шапки карточки — `Button` «На экран» (`useTvControl`, `{ mode: "employee", employeeId: id }`, тост «На стене — {имя} · 10 мин»); если по `useTvState()` этот человек сейчас на стене (`effectiveMode === "employee" && employee_id === id`) — кнопка читается «Убрать с экрана» и шлёт `{ mode: "ether" }`. Кнопка не показывается для неактивных и для роли `tv`.
6. **Ручная проверка на dev** (телефон или эмуляция iPhone SE + окно киоска под `tv`): (а) Настройки → «Экран» → страница открылась, статус «На стене» зелёный (киоск фазы B запущен); (б) тап по Марату → тост, на стене Марат ≤ 3 с, на пульте «Марат Ахметов · ещё 10 мин» и чип «на экране»; (в) «Вернуть эфир» → стена в эфире, кнопка пропала; (г) чипы заставки: «Часы» → стена показывает часы; «Команда»; «Лицо»; (д) «Посетитель» вкл → стена без фамилий; выкл → вернулись; (е) карточка Марата → «На экран» → «Убрать с экрана»; (ж) выключить Wi-Fi на телефоне → тап по сотруднику → тост «Нет связи…», стена не изменилась, состояние на пульте откатилось; (з) «Перезапустить экран» → киоск перезагрузился, через минуту статус снова «На стене».
7. Скриншоты `/screen` (iPhone SE и средний Android) по образцу `scripts/smoke-ui.ts` — пути в отчёт.

### Проверки (обязательные, машинные)
```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
Все должны завершиться успешно. Красная проверка = чинить в рамках скоупа, не расширяя его.

### Definition of Done (C)
- [ ] Шаги 1–7 выполнены, проверки зелёные, скриншоты приложены.
- [ ] Ручная проверка (шаг 6) пройдена по всем восьми пунктам; что не прошло — в отчёт, не чинить за пределами скоупа.
- [ ] Коммиты: conventional commits, мелкие; `Co-Authored-By` — своей моделью исполнителя.
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 013C tv-remote` + Сделано/Коммиты/Вопросы.
- [ ] Отчёт в чат: что сделано, вывод проверок (кратко), открытые вопросы.

---

## Вне скоупа наряда (не делать; идеи — в WORKLOG «бэклог»)
- Фокус на задаче (`mode = 'task'`, кнопка «На экран» в треде задачи) — схема готова, UI и `tv_focus` для задачи — отдельным нарядом.
- «Итоги недели», «Сравнить двоих», ответы ассистента на стене (D-34).
- Настраиваемая длительность фокуса, расписание сцен по времени суток, сцена «команда живьём» (звёзды/бездельники с Пульса) на ТВ.
- Push-уведомление директору «экран не отвечает».
- `POST /api/tv/control` и private broadcast `tv_control` — не строить: заменены `tv_state` (D-76).
- Правки `docs/BACKEND.md` §8, `docs/FRONTEND.md` «ТВ-режим», `docs/DATABASE.md`, `docs/CONCEPT.md` §3.5 — сделает архитектор при приёмке.
