# tasks/027-voice-retention.md — Голос хранится 90 дней после закрытия дела, запись без дела — 30, «в корпус» не удаляется

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропускать нельзя). Семантическое ревью сделает отдельная сессия. Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай. Идею или техдолг вне скоупа не делай — запиши одной строкой в `IDEAS.md`, раздел «Входящие» (с номером наряда).

## Зачем (D-155 п.3, D-18)

Файлы голоса в бакете `voice` копятся бессрочно. Это вопрос приватности и закона о ПД, не денег: на dev 138 файлов по 45–75 КБ. Решение владельца:
- файл записи живёт `closed_days` (по умолчанию 90) после закрытия того, к чему он относится;
- запись, из которой ничего не вышло, — `orphan_days` (по умолчанию 30);
- транскрипты и тексты остаются навсегда;
- запись, отмеченная «в корпус», не удаляется;
- чистит шаг свипа `/api/push/sweep` через Storage API — на Hobby раз в сутки, для сроков в днях этого хватает.

Контракт настроек уже заморожен архитектором — **не трогать**:
- `lib/settings.ts`: `VoiceRetentionSchema` (`closed_days`, `orphan_days`; целые 7…3650; битая секция читается как умолчания) и ключ `voice_retention` в `CompanySettingsSchema` и `SettingsPatchSchema`;
- `lib/settings.test.ts`;
- `components/settings/draft.tsx`: `SectionKey` знает `voice_retention`, `dirty.voice_retention` считается;
- `components/settings/sections.tsx`: `SectionActions` экспортирован. Остальное в файле — наряда 026, не трогать.

## Что считается «закрытием» (D-155 п.3)

| Где путь записи | Закрыто с | Пока не закрыто |
|---|---|---|
| `tasks.source_audio_path` | `done` — `closed_at`; `revoked` — момент отзыва (найди колонку) | любой другой статус, в том числе `declined`: там решает директор |
| голосовые в треде (D-66) — найди, где лежит путь | вместе с их задачей | — |
| `announcements.audio_path` | `created_at` (вышло — закрыто) | — |
| `events.audio_path` | конец мероприятия (найди колонку; без конца — начало) | до конца |
| `notes.audio_path` | никогда, пока заметка жива; удалённая — строки нет | — |
| `errands.audio_path` (заявка секретарю, D-79 §9) | `done`, `declined`, `cancelled` — `coalesce(done_at, updated_at)` | `sent`, `accepted` |
| `recurrence_rules.source_audio_path` (повтор, D-148) | остановленное правило (`not is_active`) — `updated_at`; задачи и встречи правила несут тот же путь и закрываются по своим строкам | пока правило активно |
| только `inbox_items.audio_path` (черновик конвейера) или ничего | — | запись без дела: `orphan_days` от `storage.objects.created_at` |

Файл, на который ссылаются несколько строк, удаляется, только когда закрыты все. Срок считается от самого позднего закрытия. Полный список ссылок на бакет сначала найди сам:
- `grep -rn "audio_path\|from(\"voice\")" supabase/migrations app lib`;
- путь при загрузке — `${companyId}/${userId}/${client_request_id}.${ext}` (`app/api/voice/upload-url/route.ts`).

Нашлась ссылка не из таблицы выше — СТОП и вопрос, не угадывай.

## Контекст (читать только это)
- `CLAUDE.md` — принципы 5, 6в, 7.
- `DECISIONS.md` — **только** D-155 п.3 и D-18.
- `app/api/push/sweep/route.ts` — как устроены шаги-тики свипа и что он возвращает.
- `app/api/voice/audio-url/route.ts` — как экраны получают запись. Где есть плеер голоса, найди `grep`-ом по `audio-url`.
- Защиты полей у `tasks` (`20261022120000_recurrence_live.sql`, функция с `forbidden_field_update`) и у остальных таблиц с путём записи. `service_role` защиту проходит — проверь это для каждой таблицы.
- `supabase/migrations/20260923205000_notes_reminders_trash.sql` — образец шага свипа, который удаляет (`notes_purge_trash`).
- `components/settings/SettingsTabs.tsx` — вкладка «Голос» (`ai`: `SttSection`, `ParserSection`, `DictionarySection`, `ConventionsSection`) и точки «несохранённое» на плитках.
- «Лаб»: где показаны строки распознаваний — `lib/lab/rows.ts` и страница, которая их рисует.
- Как гонять pgTAP на dev без применения миграции — запись D-152 в `WORKLOG.md` (2026-10-28, «Проверки») и раннер `C:\Users\Turing\AppData\Local\Temp\claude\z--Pulse\3d751caa-a971-4773-a7cb-88da461ab6f9\scratchpad\run-pgtap.mjs`: `node run-pgtap.mjs <test.sql> [migration.sql…]` гоняет тест внутри отката, `--sql "<query>"` — чтение.

## Владение файлами (чужое не трогать)

| Наряд | Файлы |
|---|---|
| **027 (этот)** | `supabase/migrations/20261103121000_voice_retention.sql` (метка закреплена за тобой), `supabase/tests/051_voice_retention.test.sql`, `app/api/push/sweep/route.ts`, `lib/voice/retention.ts` (+ тест), `components/settings/VoiceRetentionSection.tsx`, `components/settings/SettingsTabs.tsx`, `app/lab/**` и `components/lab/**` (только «В корпус»), плееры голоса (только «записи нет — плеера нет», если сейчас ломаются) |
| 026 (параллельно) | `supabase/migrations/20261103120000_daily_report_soft_start.sql`, `supabase/tests/050_*.sql`, `048_*.sql`, `lib/daily-report/**`, `components/daily-report/**`, `app/report/**`, `app/api/daily-report/**`, `components/settings/sections.tsx`, «Оспорить» |
| 028 (параллельно) | `components/ui/StillLogo.tsx`, `components/AppHeader.tsx`, `components/auth/Arrival.tsx`, `components/auth/LoginForm.tsx`, `components/tv/TvClock.tsx`, `components/settings/CompanyForm.tsx` |
| Архитектор | `DECISIONS.md`, `docs/**`, `lib/settings.ts`, `lib/settings.test.ts`, `components/settings/draft.tsx` |
| Сессия десктопа (D-154, идёт сейчас) | `app/desk/**`, `components/desk/**`, `lib/desk/**`, `app/globals.css`, `docs/DESIGN.md`, `scripts/smoke-desk.ts`, `proxy.ts`, `components/TabBar.tsx`, `components/profile/**` |

**Общие для всех:** `WORKLOG.md` — одна запись в конец файла; `IDEAS.md` — только новые строки в конец «Входящих». Перед каждой правкой файл перечитать: соседи пишут туда же. Доки (`docs/*.md`) не трогать: какие фразы в них поменять, напиши в отчёте, правит архитектор.

## Шаги

1. **Миграция** `supabase/migrations/20261103121000_voice_retention.sql`:
   - `voice_retention_days(p_settings jsonb, p_key text, p_default int) returns int`: целое из `settings.voice_retention.<key>`, битое или вне 7…3650 — умолчание. Те же умолчания, что в `lib/settings.ts`.
   - **«В корпус»** — таблица `voice_kept`:
     - поля: `path text primary key`, `company_id uuid not null references companies`, `kept_by uuid references profiles`, `created_at timestamptz not null default now()`;
     - RLS: читают директор и секретарь своей компании; пишут только функции;
     - негативная проверка «компания A не видит компанию B» — в pgTAP.
     RPC `voice_keep(p_path text, p_keep boolean)`: директор своей компании; путь обязан начинаться с `<его company_id>/`, иначе `forbidden`. Работает абсолютным состоянием: `true` вставляет с `on conflict do nothing`, `false` удаляет. Это исключение принципа 7 того же рода, что `tv_control`: в отчёте попроси архитектора дописать её в BACKEND §1 п.2.
   - `voice_purge_due(p_now timestamptz default now(), p_limit int default 500) returns table (company_id uuid, path text)`: файлы бакета `voice` из `storage.objects`, у которых срок вышел по таблице выше. Чтение `storage.objects` из SQL разрешено; **удалять оттуда SQL-ом нельзя**, файл удаляет Storage API.
     - Компания — по первому сегменту пути. Имя без uuid в первом сегменте пропускается.
     - Пропускается: файл из `voice_kept`; файл компании, которой нет; файл с хотя бы одной незакрытой ссылкой.
     - Только `service_role`.
   - `voice_mark_purged(p_paths text[]) returns int`: обнуляет путь во всех таблицах со ссылкой, включая `inbox_items`, только для переданных путей. Только `service_role`. Защиты полей должны пропускать `service_role` — проверь каждую. Если какая-то не пропускает, СТОП и вопрос: старые миграции не правим.
   - Grant-ы: `revoke … from public, anon, authenticated`. `voice_keep` — `authenticated`, остальные — `service_role`.
2. **Шаг свипа** (`app/api/push/sweep/route.ts`, логика — в `lib/voice/retention.ts`):
   - `voice_purge_due` → `service.storage.from("voice").remove(paths)` пачками по 100 → `voice_mark_purged` **только по удалённым** путям.
   - Ошибка Storage или RPC пишется в лог; свип не падает, остальные шаги идут; путь, который не удалился, остаётся в базе и придёт завтра.
   - В ответ свипа — `voice_purged: <число>`.
   - Файл, которого в Storage уже нет: путь всё равно обнуляется. Как `remove` отвечает на отсутствующий файл, проверь на dev на **своём** файле: залей тестовый объект `smoke-027/...` и удали.
3. **Экраны без записи.** После чистки путь — `null`: плеер голоса не рисуется, текст и транскрипт остаются. Найди все плееры: если какой-то при `null` ломается или рисует пустую кнопку, почини (только это). Сейчас они, скорее всего, уже скрываются: у набранных текстом задач записи нет.
4. **«Настройки → Голос»** — `components/settings/VoiceRetentionSection.tsx`, в `SettingsTabs.tsx` после `ConventionsSection`; точка «несохранённое» на плитке «Голос» учитывает `voice_retention`:
   - вид — тот же, что у соседних секций (`Disclosure`, чипы-варианты, `SectionActions`); заголовок «Хранение записей»;
   - «После закрытия дела» — чипы 30 / 90 / 180 / 365 дней; «Запись без дела» — 7 / 30 / 90;
   - подсказка: «Тексты и расшифровки остаются навсегда. Запись „в корпус“ из „Лаб“ не удаляется.»;
   - сохранение — `save({ voice_retention: … })`, секция целиком;
   - видят директор и секретарь — как соседние секции вкладки.
   Десктоп эту вкладку собирает сам (`components/desk/settings/SettingsPanels.tsx`), его не трогать. В отчёте напиши строку для сессии десктопа: какой компонент поставить.
5. **«В корпус» в «Лаб».** Если у строки распознавания в «Лаб» есть связь с записью (`ai_logs.client_request_id` ↔ `inbox_items.client_request_id` ↔ `audio_path`), у директора на этой строке — переключатель «В корпус» (`voice_keep`). Состояние читается из `voice_kept`. Связи нет — переключатель не делаешь и пишешь строку в IDEAS. Помечать можно и SQL-ом: `insert into voice_kept`.
6. **`WORKLOG.md`**: `## 2026-11-03 — Исполнитель (Opus) — 027 voice-retention` + Сделано / Проверки / Не проверено / Вопросы / Доки.
   В «Вопросы» обязательно: сколько файлов dev ушло бы в первую чистку, если применить миграцию сегодня. Это запрос `select count(*) from voice_purge_due(now(), 100000)` внутри отката с миграцией. Отдельно — сколько из них старше 30 дней без дела: на dev лежат записи опытов STT, и до применения владелец решит, какие пометить «в корпус».

## Проверки (обязательные, машинные; pnpm не запускать совсем)

```powershell
node node_modules/typescript/bin/tsc --noEmit -p .
node node_modules/eslint/bin/eslint.js app/api/push/sweep/route.ts lib/voice/retention.ts components/settings/VoiceRetentionSection.tsx components/settings/SettingsTabs.tsx
node node_modules/vitest/vitest.mjs run lib/voice lib/settings.test.ts
```

- **pgTAP на dev — только внутри откатываемой транзакции вместе с новой миграцией, миграцию на dev НЕ применять.**
  - `051_voice_retention` — свои фикстуры: две компании и строки `storage.objects` бакета `voice` с нужным `created_at`. Если вставить в `storage.objects` в тесте нельзя, СТОП и вопрос. Проверки:
    - задача `done` 91 день назад → файл в списке; 89 дней → нет;
    - `declined` давно → нет;
    - объявление 91 день → да;
    - живая заметка давно → нет;
    - запись только в `inbox_items` 31 день → да, 29 → нет;
    - файл в `voice_kept` → нет никогда;
    - `closed_days = 180` у компании → задача `done` 91 день назад → нет;
    - файл второй компании не попадает в чужой список и не помечается чужим `voice_keep` → `forbidden`;
    - `voice_mark_purged` обнуляет путь во всех таблицах;
    - `authenticated` не может звать `voice_purge_due` и `voice_mark_purged`.
  - После прогона dev не тронут: `select to_regclass('public.voice_kept')` → `null`.
- **Шаг свипа** — vitest с подменой клиента Supabase: удалённые пути обнуляются, неудалённые — нет; ошибка Storage не роняет свип.
- **Экран** «Настройки → Голос» глазами — системный Chrome через Playwright, ширина 390, под `test@demo.local`, скриншот в свою папку scratchpad. **На dev ничего не сохранять**: база общая с владельцем. Если вход не пускает (код по умолчанию, D-135), пиши «не проверено глазами» и почему.
- **Реальный файл на dev не удалять**, кроме своего тестового `smoke-027/...` (шаг 2).
- tsc: ошибки в чужих файлах (соседи работают параллельно) не чинить, перечислить в отчёте. В своих — 0.

Красная проверка = чинить в рамках скоупа, не расширяя его.

## Вне скоупа наряда (не делать; идеи — в `IDEAS.md`, «Входящие», с пометкой «027»)
- Фото (`photos`) и логотипы (`brand`) — срок не решён.
- Удаление транскриптов, `ai_logs`, «Экспорт голоса» перед удалением.
- Подпись «запись удалена через N дней» у плеера.
- Десктоп (`components/desk/**`) — не трогать.
- Доки, `DECISIONS.md`, `lib/settings.ts`, `components/settings/draft.tsx`, `components/settings/sections.tsx` — не твои.
- Коммит, `db push`, применение миграции на dev, ветки, worktree — не делать.
