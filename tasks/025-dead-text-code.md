# tasks/025-dead-text-code.md — Тексты, которые расходятся с кодом, и мёртвый код

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропускать нельзя). Семантическое ревью сделает отдельная сессия. Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай. Идею или техдолг вне скоупа не делай — запиши одной строкой в `IDEAS.md`, раздел «Входящие» (с номером наряда).

## Зачем (аудит долгов 2026-11-03)

Ссылки внутри приложения и адреса пушей из базы целы — это проверено скриптом по всем 104 маршрутам. Остались тексты, которые обещают несуществующее, и код, который никто не зовёт. Поведение приложения наряд не меняет.

## Контекст (читать только это)
- `CLAUDE.md` — принцип 1a.
- `DECISIONS.md` — сводка «Сейчас действует», абзац «Продукт и поставка» (D-134: одна база, граница — `company_id` + RLS, отдельный инстанс — опция поставки). Только прочитать.
- Файлы из «Владения» ниже.

## Владение файлами (чужое не трогать)

| Наряд | Файлы |
|---|---|
| **025 (этот)** | `CLAUDE.md` (только принцип 1a), `components/lab/pitch/PitchStory.tsx`, `tests/stt/RECORDING.md`, `.gitignore` (только комментарий STT), `app/layout.tsx` (только комментарий), `lib/people/loads.ts` (только комментарий), `components/ui/PageSkeletons.tsx` (только `ScreenSkeleton`), `components/tasks/TaskSkeleton.tsx`, `app/(director)/pulse-pixel/` |
| 023 (параллельно) | новая миграция и `supabase/tests/049_*`, `app/api/voice/confirm/route.ts`, `lib/points/queries.ts`, `scripts/seed-client.ts`, `docs/DATABASE.md`, `docs/BACKEND.md`, `docs/SETUP.md` |
| 024 (параллельно) | `lib/tasks/queries.ts`, `lib/notes/queries.ts`, `components/OfflineBanner.tsx`, `scripts/smoke-*.ts` |
| 022 (десктоп, может идти параллельно) | `app/desk/**`, `components/desk/**`, `lib/desk/**`, `proxy.ts`, `components/TabBar.tsx`, `components/profile/**`, `components/ui/Sheet.tsx`, `app/globals.css`, `package.json`, `DECISIONS.md`, `docs/FRONTEND.md`, `docs/CONCEPT.md`, `docs/DESIGN.md`, `docs/TESTING.md` |

**Общие для всех:** `WORKLOG.md` — одна запись в конец файла; `IDEAS.md` — пометки на своих строках и новые строки в конец «Входящих». Перед каждой правкой файл перечитать: соседи пишут туда же.

## Шаги

1. **`CLAUDE.md`, принцип 1a.** «эффекты играют поверх через `<EffectsLayer>`» → «эффекты играют поверх действия (отдельного слоя `<EffectsLayer>` нет — И-38)». Больше в `CLAUDE.md` ничего не менять.
2. **`components/lab/pitch/PitchStory.tsx`** — страница для инвестора. Цифры на ней — снимки; не пересчитывать и не придумывать новые.
   - ~305, столп «Не подводит»: `["Отдельная база на клиента", "Никакой общей базы на всех: данные каждой компании лежат физически отдельно."]` → `["Компании не видят друг друга", "Каждая строка в базе помечена своей компанией, чужое закрыто на уровне самой базы. Нужна база в своей стране — ставим отдельный сервер, код тот же."]`.
   - ~477, плитка `icon="lock"`: заголовок «Своя база у каждого клиента» → «Чужие данные закрыты в самой базе». Текст → «Компании живут на одной платформе, но каждая видит только своё — это держит база, а не экран. Клиенту, которому нужна база в своей юрисдикции, — отдельный сервер с тем же кодом.»
   - ~285: «Автотесты на 66 фразах, включая казахские и смешанные.» → «Автотесты на 66 фразах, включая казахские и смешанные · прогон 22.09.2026.» Так тот же факт с датой цитирует `components/lab/tech/TechStory.tsx:167`.
   - Других мест про «отдельную базу» на странице нет: проверь `grep -n "тдельн" components/lab/pitch/*.tsx`. Найдётся ещё — привести так же и назвать в отчёте.
3. **STT-корпус: мастер-копии в Storage нет** (И-100). Бакета `stt-fixtures` не существует, сам `docs/STT_GATE.md` §3 это уже честно пишет.
   - `tests/stt/RECORDING.md` (~21): убрать обещание мастер-копии в бакете. Аудио корпуса лежит только локально в `tests/stt/fixtures/` (в `.gitignore`), копии в Storage нет.
   - `.gitignore` (~56): комментарий → `# STT gate: audio fixtures are local only (no Storage copy yet), run outputs are local`. Сами правила не трогать.
4. **Комментарии, которые врут.**
   - `app/layout.tsx:32`: убрать «(no serwist yet — D-40 PWA core is next)». serwist отменён, свой `public/sw.js` есть (D-127). Остаётся `// iOS home-screen install: own window, dark status bar`.
   - `lib/people/loads.ts:26`: «docs/DATABASE.md v_employee_load rules, computed on the client until the view lands.» Такого раздела в DATABASE.md нет, вью не планируется → «Load rules, computed on the client; a database view only if measurement asks for it (IDEAS И-98).»
5. **Мёртвый код.** Непосредственно перед удалением и ещё раз в конце: `grep -rnw "ScreenSkeleton\|TaskSkeleton" app components lib`. Параллельный наряд 022 строит десктоп и может начать их импортировать — тогда не удалять, написать в отчёте.
   - `components/ui/PageSkeletons.tsx`: удалить экспорт `ScreenSkeleton`. Если внутренний помощник файла был нужен только ему — удалить и помощника. Остальные экспорты не трогать (`TaskPageSkeleton` — другой, живой).
   - `components/tasks/TaskSkeleton.tsx`: удалить файл.
   - `app/(director)/pulse-pixel/`: пустая папка — удалить.
6. **`IDEAS.md`** — пометки, каждая только после проверки грепом в коде; не подтвердилось — не помечать, написать в отчёте:
   - «→ исправлено нарядом 025 (2026-11-03)»:
     - И-93 — у пустой `pulse-pixel` и «until the view lands»; остальные хвосты И-93 не трогать;
     - строка «Входящих» D-122 про неиспользуемые `ScreenSkeleton`/`TaskSkeleton`;
     - строка «Как работает Pulse» отстаёт от D-134;
     - И-100 — часть про бакет `stt-fixtures`.
   - «→ уже исправлено в коде (проверено 2026-11-03, наряд 025)»:
     - строка «Входящих» D-126 про `rootMargin` в `PageHead.tsx`/`SettingsTabs.tsx` — сейчас `Math.max(0, Math.round(…))` и `Math.round(top)`;
     - строка про состояния маскота `angry`/`surprised`/`bored`/`swearing` — в коде их нет;
     - две строки про таймаут `tests/mascot-anim.test.ts` — сейчас `{ timeout: 20_000 }`.
7. **`WORKLOG.md`**: `## 2026-11-03 — Исполнитель (Opus) — 025 dead-text-code` + Сделано / Проверки / Вопросы.

## Проверки (обязательные, машинные; pnpm не запускать совсем)

```powershell
node node_modules/typescript/bin/tsc --noEmit -p .
node node_modules/eslint/bin/eslint.js components/lab/pitch/PitchStory.tsx components/ui/PageSkeletons.tsx app/layout.tsx lib/people/loads.ts
node node_modules/vitest/vitest.mjs run
```
Плюс:
- `grep -rnw "ScreenSkeleton\|TaskSkeleton" app components lib` пусто;
- `Test-Path "app/(director)/pulse-pixel"` → `False`;
- `grep -n "EffectsLayer" CLAUDE.md` — одна строка, с «нет — И-38».

tsc: ошибки в чужих файлах (соседи работают параллельно) не чинить, перечислить в отчёте; в своих — 0. Красная проверка = чинить в рамках скоупа, не расширяя его.

## Вне скоупа наряда (не делать; идеи — в `IDEAS.md`, «Входящие», с пометкой «025»)
- `docs/FRONTEND.md:374` называет `components/confirm/useRoster`, а хук в `lib/people/roster.ts`. Файл сейчас правит 022 — не трогать; строкой в IDEAS «после 022».
- Дата сводки «Сейчас действует» в `DECISIONS.md` (2026-09-25 при содержании по D-152) — файл архитектора, его сейчас правит 022.
- Строка «Telegram — скоро» в профиле — заглушка D-21, решение владельца; `components/profile/**` правит 022.
- Остальные хвосты И-93 (`keyLabels` в `lib/tv/remote.test.ts`, имя `RemoteSkeleton`, подпись в `MascotGallery`), копии приёма гидратации (И-94), поиск других неиспользуемых экспортов.
- Удаление слитых веток `feat/code-login`, `feat/login-sessions`, `feat/points-game` — только по слову владельца.

## Правила процесса
- Работаем в `Z:\Pulse` на `main`: без worktree, без новых веток, без переключения веток. **Не коммитить, не пушить.**
- Чужие незакоммиченные правки (`DECISIONS.md`, `tasks/022-desktop.md`, работа 022/023/024) не откатывать и не трогать. `git status --short` — перед отчётом.
- Комментарии в коде — английские, тексты UI — русские, без упоминаний клиента.

## Definition of Done
- [ ] Шаги 1–7 выполнены, проверки зелёные.
- [ ] Коммитов нет (ждут слова владельца); отчёт перечисляет свои файлы по `git status --short` и какие пометки IDEAS не подтвердились.
- [ ] WORKLOG.md сделан.
