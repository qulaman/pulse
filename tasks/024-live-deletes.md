# tasks/024-live-deletes.md — Клиент: удаления доезжают до «Задач» и корзины, `OfflineBanner` не обновляется в чужом рендере, смоуки входят живыми учётками

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропускать нельзя). Семантическое ревью сделает отдельная сессия. Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай. Идею или техдолг вне скоупа не делай — запиши одной строкой в `IDEAS.md`, раздел «Входящие» (с номером наряда).

## Зачем (аудит долгов 2026-11-03)

1. **«Задачи» (`/sent`) не слышат удаление.** Realtime не шлёт DELETE в канал с фильтром. У Ленты и «Моих дел» для этого есть отдельный нефильтрованный канал `useTaskDeletes` (`lib/tasks/queries.ts`, ~143), а `useSentTasks` (~273) его не подключает. Задача, удалённая с другого устройства, висит в списке до следующего снимка (IDEAS «Входящие», 2026-10-22).
2. **Корзина заметок не слышит окончательное удаление.** `notes_purge_trash` и «Удалить навсегда» с другого устройства: `useNotes` слушает `notes` с фильтром `user_id=eq.<я>`, DELETE туда не приходит (IDEAS «Входящие», D-126).
3. **«Cannot update a component (OfflineBanner) while rendering …»** в dev (IDEAS «Входящие», 2026-10-22). `RoleScope` по замыслу кладёт `me` в кэш запросов прямо в рендере (D-126). `useLatestFetch` в `components/OfflineBanner.tsx` подписан на кэш синхронно и обновляет баннер посреди чужого рендера.
4. **Смоуки входят как `marat@demo.local` / `demo1234`, а этот вход на dev не работает** (И-91). Затронуты `smoke-board`, `smoke-cleanup`, `smoke-jank`, `smoke-realtime`, `smoke-stages`, `smoke-ui`, `smoke-voice`. `scripts/smoke-tasks.ts` уже берёт сотрудника из `EMPLOYEE` с умолчанием `erlan.b@demo.local`.

## Контекст (читать только это)
- `CLAUDE.md` — раздел «Стек» (State, Realtime).
- `lib/tasks/queries.ts` — `useTaskDeletes`, `useMyTasks`, `useSentTasks`.
- `lib/notes/queries.ts` — `useNotes`, `noteKeys`.
- `lib/realtime/useRealtimeQuery.ts` и `useRealtimeListener`: в каком файле он лежит, видно по импорту в `lib/tasks/queries.ts`.
- `components/OfflineBanner.tsx`, `components/RoleScope.tsx` (только прочитать, не менять).
- `scripts/smoke-tasks.ts` (строки 1–70: учётки и вход) и семь затронутых смоуков.

## Владение файлами (чужое не трогать)

| Наряд | Файлы |
|---|---|
| **024 (этот)** | `lib/tasks/queries.ts` (только функция `useSentTasks` и её комментарий), `lib/notes/queries.ts`, `components/OfflineBanner.tsx`, `scripts/smoke-board.ts`, `scripts/smoke-cleanup.ts`, `scripts/smoke-jank.ts`, `scripts/smoke-realtime.ts`, `scripts/smoke-stages.ts`, `scripts/smoke-ui.ts`, `scripts/smoke-voice.ts` |
| 023 (параллельно) | новая миграция и `supabase/tests/049_*`, `app/api/voice/confirm/route.ts`, `lib/points/queries.ts`, `scripts/seed-client.ts`, `docs/DATABASE.md`, `docs/BACKEND.md`, `docs/SETUP.md` |
| 025 (параллельно) | `CLAUDE.md`, `components/lab/pitch/PitchStory.tsx`, `tests/stt/RECORDING.md`, `.gitignore`, `app/layout.tsx`, `lib/people/loads.ts`, `components/ui/PageSkeletons.tsx`, `components/tasks/TaskSkeleton.tsx`, `app/(director)/pulse-pixel/` |
| 022 (десктоп, может идти параллельно) | `app/desk/**`, `components/desk/**`, `lib/desk/**`, `proxy.ts`, `components/TabBar.tsx`, `components/profile/**`, `components/ui/Sheet.tsx`, `app/globals.css`, `package.json`, `scripts/smoke-desk.ts`, `DECISIONS.md`, `docs/FRONTEND.md`, `docs/CONCEPT.md`, `docs/DESIGN.md`, `docs/TESTING.md` |

**Общие для всех:** `WORKLOG.md` — одна запись в конец файла; `IDEAS.md` — пометки на своих строках и новые строки в конец «Входящих». Перед каждой правкой файл перечитать: соседи пишут туда же.

**Внимание:** тимлид 022 может добавить новый хук в тот же `lib/tasks/queries.ts`. Трогай только `useSentTasks` и перечитывай файл непосредственно перед правкой.

## Шаги

0. **Воспроизвести п. 3 до правок.** Поднять или найти dev-сервер (см. «Правила процесса»). Scratch-скрипт Playwright (system Chrome, `channel: "chrome"`, вход директором как в `scripts/smoke-board.ts:94`) открывает `/pulse`, `/sent`, `/notes`, `/calendar` и собирает `console` с текстом `Cannot update a component`. Записать, сколько раз и на каких экранах. Скрипт — в scratchpad сессии, не в репозитории.
1. **`useSentTasks`**: первой строкой — `useTaskDeletes(Boolean(userId));`, как в `useMyTasks`. В JSDoc функции — фраза «Deletes come on their own unfiltered channel (`useTaskDeletes`)», как у `useMyTasks`.
2. **`lib/notes/queries.ts`**: нефильтрованный слушатель DELETE на `notes` — по образцу `useTaskDeletes`: `useRealtimeListener`, `event: "DELETE"`, свой ключ реестра `"note-deletes"`, пустая функция догона.
   - Обработчик убирает строку с этим `id` из `noteKeys.mine(userId)` и инвалидирует `noteKeys.count(userId)`.
   - Подключить в `useNotes`. Существующий обработчик DELETE в фильтрованном канале не убирать.
   - Комментарий — коротко, почему канал без фильтра: событие несёт только id; id, которого нет в списке, ничего не меняет.
3. **`components/OfflineBanner.tsx`, `useLatestFetch`**: колбэк подписки на кэш вызывать через `notifyManager.schedule(onChange)` из `@tanstack/react-query`. Тогда запись в кэш во время чужого рендера доходит до баннера уже после рендера. Одна строка комментария — почему. `RoleScope` не трогать: посев в рендере — по замыслу (D-126).
4. **Смоуки** (семь файлов из п. 4 «Зачем»):
   - **Роль.** Сначала service-role запросом выяснить, в какой роли каждый скрипт использует Марата: сотрудник или секретарь. На dev Марат — секретарь.
   - **Замена.** Роль сотрудника → `process.env.EMPLOYEE ?? "erlan.b@demo.local"` с демо-паролем, как в `smoke-tasks.ts`. Роль секретаря → `process.env.SECRETARY ?? "<секретарь dev, чей демо-пароль работает>"`.
   - **Проверка учётки.** Каждую подставляемую проверить заранее scratch-скриптом через `signInWithPassword`. Работающей нет — **СТОП**, в отчёт: пароли на dev не менять, людей не создавать.
   - Поведение смоуков не менять. Вход `smoke:ui` через FAB Пульса (сломан с D-60) — вне скоупа.
5. **`IDEAS.md`**: пометить «→ исправлено нарядом 024 (2026-11-03)» у трёх строк «Входящих»: «Задачи» не слышат удаление (2026-10-22), жёсткое удаление заметок (D-126), setState чужого компонента (2026-10-22). У И-91 — «→ входы исправлены нарядом 024; вход `smoke:ui` через FAB — нет».
6. **`WORKLOG.md`**: `## 2026-11-03 — Исполнитель (Opus) — 024 live-deletes` + Сделано / Проверки / Не проверено / Вопросы.

## Проверки (обязательные, машинные; pnpm не запускать совсем)

```powershell
node node_modules/typescript/bin/tsc --noEmit -p .
node node_modules/eslint/bin/eslint.js lib/tasks/queries.ts lib/notes/queries.ts components/OfflineBanner.tsx scripts/smoke-board.ts scripts/smoke-cleanup.ts scripts/smoke-jank.ts scripts/smoke-realtime.ts scripts/smoke-stages.ts scripts/smoke-ui.ts scripts/smoke-voice.ts
node node_modules/vitest/vitest.mjs run
```

**Живые проверки** — scratch-скрипт Playwright против dev-сервера, вход директором:

- **`/sent`:**
  - Service role вставляет задачу директора: `status = 'scheduled'`, `scheduled_send_at = now() + 30 days`, исполнитель `erlan.b@demo.local`, заголовок `smoke 024 <метка>`. Отложенная невидима исполнителю, пуша нет.
  - Открыть `/sent`, дождаться заголовка. Service role удаляет задачу — заголовок уходит со страницы **без перезагрузки** за ≤ 5 с.
  - В `finally` — повторное удаление и проверка, что строки нет. Иначе через 30 дней задача уйдёт человеку.
- **Корзина заметок:** service role вставляет заметку директора с `deleted_at = now()`, текст `smoke 024 <метка>`. Открыть корзину на `/notes` тем же путём, что экран, и дождаться текста. Жёсткое удаление service role → строка уходит без перезагрузки за ≤ 5 с.
- **`OfflineBanner`:** прогон шага 0 повторить — `Cannot update a component (OfflineBanner)` 0 раз. Остальные предупреждения перечислить в отчёте как есть, не чинить.
- **Смоуки:**
  - Перед запуском — `ai_logs` dev за последние 10 минут. Владелец активен → мутирующие смоуки не запускать, только проверка входа.
  - Запускать только те, чья шапка говорит, что скрипт убирает за собой и не выдаёт задач, объявлений и заявок людям (это будит телефоны). Остальные — только tsc и проверка входа.
  - В отчёте — какие запущены и с каким итогом.

tsc: ошибки в чужих файлах (соседи работают параллельно) не чинить, перечислить в отчёте; в своих — 0. Красная проверка = чинить в рамках скоупа, не расширяя его.

## Вне скоупа наряда (не делать; идеи — в `IDEAS.md`, «Входящие», с пометкой «024»)
- Вход `smoke:ui` через FAB Пульса; отдельный демо-логин для смоуков; `docs/TESTING.md` (его правит 022) — нужное записать строкой в IDEAS.
- Удаления в кэшах досок (`lib/mindboard/**`): если они тоже не слышат DELETE — строкой в IDEAS.
- Другие предупреждения консоли, `RoleScope`, `PageHead`, `NamesSync`.
- Миграции, API-роуты, `public/sw.js`.

## Правила процесса
- Работаем в `Z:\Pulse` на `main`: без worktree, без новых веток, без переключения веток. **Не коммитить, не пушить, миграции не применять.**
- **Dev-сервер один на папку.** Если `http://localhost:3000/api/health` отвечает — пользоваться им. Иначе поднять `node node_modules/next/dist/bin/next dev` в фоне и в конце остановить только свой. Второй `next dev` в той же папке не запускать: у 022 свой смоук, общий `.next` ломается.
- Чужие незакоммиченные правки (`DECISIONS.md`, `tasks/022-desktop.md`, работа 022/023/025) не откатывать и не трогать. `git status --short` — перед отчётом.
- Dev общий с владельцем: учётку `test@demo.local` (телефон владельца) — только для входа в браузер, без действий, которые шлют ему пуши. Пароли и людей на dev не менять.
- Комментарии в коде — английские, тексты UI — русские.

## Definition of Done
- [ ] Шаги 0–6 выполнены, проверки зелёные; живые проверки — с выводом в отчёте (до/после для п. 3).
- [ ] После прогонов на dev нет строк `smoke 024 …` ни в `tasks`, ни в `notes`.
- [ ] Коммитов нет (ждут слова владельца); отчёт перечисляет свои файлы по `git status --short`.
- [ ] WORKLOG.md и пометки IDEAS.md сделаны.
