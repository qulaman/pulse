# tasks/023-rpc-guards.md — Сервер: исполнитель только из своей компании, очки только включённые, у нового клиента витрина

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропускать нельзя). Семантическое ревью сделает отдельная сессия. Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай. Идею или техдолг вне скоупа не делай — запиши одной строкой в `IDEAS.md`, раздел «Входящие» (с номером наряда).

## Зачем (аудит долгов 2026-11-03)

1. **`confirm_voice_batch` берёт `assignee_id` из запроса как есть.** Сверку делает только роут `/api/voice/confirm`: он читает `profiles` под RLS, поэтому чужого или уволенного не пропустит. Но у RPC есть `grant execute … to authenticated`, и директор может позвать её напрямую через PostgREST. Тогда задача, повтор или очки уйдут уволенному, киоску `tv` или человеку **другой компании**. `tasks.assignee_id` — простой FK на `profiles`, компанию он не держит. Outbox поставит пуш чужому сотруднику. В общей базе (D-134) это дыра между клиентами (принцип 6б).
2. **`award_points` не проверяет `points_enabled`** (И-89): выключенные очки держат только интерфейс и `confirm_voice_batch`.
3. **Новый клиент получает пустой магазин** (И-79): стартовую витрину миграция `20260917160000_shop.sql` поставила только тем компаниям, что уже были, а `scripts/seed-client.ts` товаров не создаёт.

## Контекст (читать только это)
- `CLAUDE.md` — принципы 6, 7.
- `supabase/migrations/20261022120000_recurrence_live.sql` — текущее тело `confirm_voice_batch` (последнее по имени файла; перед копированием проверь `grep -l "function confirm_voice_batch(" supabase/migrations/*.sql`).
- `supabase/migrations/20261014120000_points_game.sql` — текущее тело `award_points` и его grant.
- `supabase/migrations/20260917160000_shop.sql` — блок `insert into shop_items` (стартовая витрина, ~строка 390).
- `app/api/voice/confirm/route.ts`, `lib/points/queries.ts` (мутация вокруг `rpc("award_points")`), `scripts/seed-client.ts`, `scripts/client.example.json`.
- Образец pgTAP: `supabase/tests/041_points_game.test.sql` и `047_recurrence_live.test.sql` (как заводятся компании, люди и `request.jwt.claims`).
- Как гонять pgTAP на dev без применения миграции — запись D-152 в `WORKLOG.md` (2026-10-28, «Проверки») и память `pgtap-needs-docker`.

## Владение файлами (чужое не трогать)

| Наряд | Файлы |
|---|---|
| **023 (этот)** | новая миграция `supabase/migrations/<ts>_rpc_guards.sql`, `supabase/tests/049_rpc_guards.test.sql`, `app/api/voice/confirm/route.ts`, `lib/points/queries.ts` (только разбор ошибки `award_points`), `scripts/seed-client.ts`, `docs/DATABASE.md`, `docs/BACKEND.md`, `docs/SETUP.md` §5 |
| 024 (параллельно) | `lib/tasks/queries.ts`, `lib/notes/queries.ts`, `components/OfflineBanner.tsx`, `scripts/smoke-*.ts` (кроме `smoke-desk.ts`) |
| 025 (параллельно) | `CLAUDE.md`, `components/lab/pitch/PitchStory.tsx`, `tests/stt/RECORDING.md`, `.gitignore`, `app/layout.tsx`, `lib/people/loads.ts`, `components/ui/PageSkeletons.tsx`, `components/tasks/TaskSkeleton.tsx`, `app/(director)/pulse-pixel/` |
| 022 (десктоп, может идти параллельно) | `app/desk/**`, `components/desk/**`, `lib/desk/**`, `proxy.ts`, `components/TabBar.tsx`, `components/profile/**`, `components/ui/Sheet.tsx`, `app/globals.css`, `package.json`, `DECISIONS.md`, `docs/FRONTEND.md`, `docs/CONCEPT.md`, `docs/DESIGN.md`, `docs/TESTING.md`, `app/(director)/admin/**`, `components/admin/**` |

**Общие для всех:** `WORKLOG.md` — одна запись в конец файла; `IDEAS.md` — пометки на своих строках и новые строки в конец «Входящих». Перед каждой правкой файл перечитать: соседи пишут туда же.

## Шаги

1. **Миграция** `supabase/migrations/<YYYYMMDDHHMMSS>_rpc_guards.sql`. Метка — текущее время, позже `20261028120000_daily_reports.sql`; перед созданием проверь `ls supabase/migrations | tail -3`: соседняя сессия могла занять метку.
   - `create or replace function confirm_voice_batch(...)`: тело — **дословная копия текущего**, сигнатура та же. Добавь одну проверку исполнителя в ветки `task`/`delegation`, `recurrence` и `points`. В `points` она идёт после пропуска `points_disabled` и после `assignee_required`, существующий порядок не меняй:
     `if not exists (select 1 from profiles p where p.id = v_assignee and p.company_id = v_company and p.is_active and p.role <> 'tv') then raise exception 'assignee_inactive' using errcode = 'P0001'; end if;`
     Один код и для чужого, и для уволенного: существование чужого id не выдаётся. Комментарий в стиле соседей, английский, одна-две строки: почему проверка в RPC, а не только в роуте.
   - `create or replace function award_points(...)`: тело — копия текущего. Сразу после проверки роли добавь проверку флага — тем же выражением, что в `confirm_voice_batch` (`coalesce((settings->>'points_enabled')::boolean, false)` из `companies` по `v_company`) → `raise exception 'points_disabled' using errcode = 'P0001'`.
   - Grant-ы не трогать: `create or replace` их сохраняет. `drop function` не нужен — сигнатуры не меняются. Других функций в миграции нет.
2. **`app/api/voice/confirm/route.ts`**: ошибку RPC с `assignee_inactive` разобрать так же, как роут уже отвечает на свою проверку: `apiError(400, "assignee_inactive", "Этот сотрудник больше не работает — выбери другого")`. Рядом — существующий разбор `assignee_required`. Больше ничего в роуте не менять.
3. **`lib/points/queries.ts`**: если у мутации начисления есть разбор кодов ошибок в русские слова — добавь `points_disabled` → «Очки в компании выключены». Если разбора нет — файл не трогать.
4. **pgTAP** `supabase/tests/049_rpc_guards.test.sql`. Фикстуры — свои внутри теста: две компании, у первой директор, работающий сотрудник, уволенный (`is_active=false`) и пользователь `tv`, у второй — один сотрудник. На данные dev не опираться: роли людей dev плавают — например, Марат там секретарь. Проверки:
   - `award_points` при `points_enabled=false` → `points_disabled`; при `true` → проходит, строка в `point_transactions` есть;
   - `confirm_voice_batch`, вид `task`: уволенный → `assignee_inactive`; сотрудник второй компании → `assignee_inactive`, и строк `tasks` с этим `assignee_id` нет; `tv` → `assignee_inactive`; работающий своей компании → ровно одна задача;
   - вид `recurrence` с исполнителем второй компании → `assignee_inactive`;
   - вид `points` с исполнителем второй компании: при включённых очках → `assignee_inactive`, при выключенных → пропуск `points_disabled` в ответе, без исключения.
   Форму `payload` возьми из `047_recurrence_live.test.sql`.
5. **`scripts/seed-client.ts`**:
   - Если у компании нет ни одного `shop_items`, после создания или обновления компании вставь стартовую витрину — ровно те четыре строки и поля, что в `20260917160000_shop.sql`. `--dry-run` печатает «витрина: 4 товара (будут созданы)» или «витрина: уже есть, не трогаю».
   - `--undo` удаляет товары компании до удаления самой компании: FK `shop_items.company_id` без каскада.
   - Шапку и текст ошибки про `.env.local` привести к D-134: скрипт заводит компанию в общей базе; отдельный инстанс — опция поставки, тот же скрипт против его проекта. Остальное в скрипте не трогать.
6. **Доки** — по одной-две фразы, по факту:
   - `docs/DATABASE.md` или `docs/BACKEND.md` (где описаны эти RPC): исполнитель проверяется в самой RPC; `award_points` уважает `points_enabled`;
   - `docs/SETUP.md` §5: `seed:client` ставит стартовую витрину.
7. **`IDEAS.md`**: пометить «→ исправлено нарядом 023 (2026-11-03), миграция ждёт применения на dev» у И-79, И-89 и у строки «Входящих» `(D-139, 2026-10-20) confirm_voice_batch не проверяет, что исполнитель задачи работает`.
8. **`WORKLOG.md`**: `## 2026-11-03 — Исполнитель (Opus) — 023 rpc-guards` + Сделано / Проверки / Не проверено / Вопросы.

## Проверки (обязательные, машинные; pnpm не запускать совсем)

```powershell
node node_modules/typescript/bin/tsc --noEmit -p .
node node_modules/eslint/bin/eslint.js app/api/voice/confirm/route.ts lib/points/queries.ts scripts/seed-client.ts
node node_modules/vitest/vitest.mjs run
```

- **pgTAP на dev — только внутри откатываемой транзакции, вместе с новой миграцией** (рецепт D-152):
  - `049` — все проверки зелёные;
  - `041_points_game`, `047_recurrence_live`, `048_daily_reports` — вывод с миграцией и без одинаков (на dev у части файлов есть известные падения из-за данных — сравнивай «до/после», а не «0 падений»).
  - После прогона убедись, что dev не тронут: `select prosrc like '%assignee_inactive%' from pg_proc where proname = 'confirm_voice_batch'` → `false`.
- **`seed:client` на dev:**
  - Анкета — копия `scripts/client.example.json` в scratchpad сессии: slug `smoke-023`, компания «Смоук 023», все почты `@smoke023.test`.
  - Порядок: `node node_modules/tsx/dist/cli.mjs scripts/seed-client.ts <анкета> --dry-run` → без флага → service role показывает у компании 4 товара → `--undo` → ни компании, ни товаров, ни auth-пользователей `@smoke023.test`.
- tsc: ошибки в чужих файлах (соседи работают параллельно) не чинить, перечислить в отчёте. В своих — 0.

Красная проверка = чинить в рамках скоупа, не расширяя его.

## Вне скоупа наряда (не делать; идеи — в `IDEAS.md`, «Входящие», с пометкой «023»)
- Пять RPC без `client_request_id` (И-88: `delete_task`, `purge_closed_tasks`, `set_event_participants`, `update_company_settings`, `update_company_profile`) — ждёт решения владельца: узаконить исключениями или чинить.
- Ограничение частоты запросов (И-84), срок хранения аудио (И-80), согласия на ПД (И-81) — ждут решений.
- `daily_reports` в `/admin` — после 022: его роль C переносит спецификации таблиц.
- `db:types` и `lib/supabase/types.ts` — сигнатуры не меняются, перегенерация не нужна.
- Любые другие RPC, триггеры, политики RLS.

## Правила процесса
- Работаем в `Z:\Pulse` на `main`: без worktree, без новых веток, без переключения веток.
- **Не коммитить, не пушить. `supabase db push`, `migration repair` и любое применение миграции к dev запрещены** — нужна явная команда владельца с именем миграции.
- В рабочей копии лежат чужие незакоммиченные правки (`DECISIONS.md`, `tasks/022-desktop.md`, работа 022/024/025) — не откатывать, не форматировать, не трогать. `git status --short` — перед отчётом.
- Dev общий с владельцем: `seed:client` — только с отдельной тестовой компанией и `--undo` в конце. Ничего, что шлёт пуши людям dev.
- Комментарии в коде — английские, тексты UI — русские, без упоминаний клиента.

## Definition of Done
- [ ] Шаги 1–8 выполнены, проверки зелёные; pgTAP и `seed:client` — с выводом в отчёте.
- [ ] Миграция лежит файлом, на dev не применена (проверено запросом к `pg_proc`).
- [ ] Коммитов нет (ждут слова владельца); отчёт перечисляет свои файлы по `git status --short`.
- [ ] WORKLOG.md и пометки IDEAS.md сделаны.
