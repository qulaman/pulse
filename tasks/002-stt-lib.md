# tasks/002-stt-lib.md — `lib/ai/stt.ts`: интерфейс STT, провайдеры, guard от галлюцинаций

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропускать нельзя). Семантическое ревью сделает отдельная сессия. Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай.

## Контекст (читать только это)
- `docs/AI.md` §1 (STT) — контракт интерфейса и полный список guard-правил (а)–(ж).
- `tests/stt/run.mjs` строки 20–150: `normalize`, `NUMWORDS`, `stem`, `rosterPrompt`, `sttOpenAI`, `sttDeepgram`, `sttScribe` — это прототип, который ПЕРЕНОСИТСЯ в TypeScript (логику не менять, только типизировать).
- `tests/stt/roster.json` — формат ростера.
- Решения: D-39 (primary = `gpt-4o-transcribe`, сменный интерфейс), G.8 (`prompt` со списком имён).
- Предусловие: наряд 001 смержен (pnpm, vitest, zod существуют).

## Ветка и скоуп
- Ветка: `feat/002-stt-lib` от `main`.
- Трогать только: `lib/text/normalize.ts` (+тест), `lib/ai/stt.ts`, `lib/ai/stt-providers.ts`, `lib/ai/stt-guard.ts` (+тесты), `WORKLOG.md`. `tests/stt/run.mjs` и `record.html` НЕ трогать (дедупликация с прототипом — отдельным нарядом).

## Шаги
1. `lib/text/normalize.ts` — перенести из run.mjs без изменения поведения: `NUMWORDS`, `normalize(s)`, `ENDINGS` (тот же список, сортировка по длине), `stem(word)` (рекурсивный, стоп при длине ≤3), `stems(text)`, `tokens(text)`. Экспортировать всё. Тест `lib/text/normalize.test.ts`: (а) `normalize("В десять, Ё!")` → `"в 10 е"`; (б) падежные пары — `stem` даёт одинаковый результат для: Ерлан/Ерлану/Ерланға, Марат/Марату/Маратқа, Сәкен/Сәкенге, Алия/Алияға, Айгуль/Айгули, Динара/Динаре; (в) `stem("Сәкенге")` НЕ равен `"сәк"` (окончание `-ге`, а не `-нге`); (г) короткие слова (≤3 букв) не усекаются.
2. `lib/ai/stt.ts` — типы ровно как в AI.md §1: `SttOptions`, `SttResult`, `SttProvider`; плюс `class SttError extends Error { code: 'stt_failed' | 'stt_timeout' | 'stt_http' }`. Функция `buildVocabularyHints(roster: { users: {full_name: string; aliases: string[]}[]; counterparties: string[] }): string[]` — массив строк вида `"Ерлан Байжанов / Ерлан Б"` для каждого пользователя (полное имя + алиасы, дубли убраны) и отдельно контрагенты; функция `hintsToPrompt(hints: string[]): string` — собирает ту же строку, что `rosterPrompt()` в run.mjs («Имена сотрудников: … . Контрагенты и объекты: … .»). Функция `getSttProviders(env)`: primary по `STT_PROVIDER` (`openai` → `openai-4o`; допустимые значения: `openai`, `whisper1`, `deepgram`, `elevenlabs`), fallback по `STT_FALLBACK_PROVIDER` (может отсутствовать). Функция `transcribe(audio: Buffer, mime: string, opts: SttOptions, providers = getSttProviders(process.env)): Promise<SttResult>` — **фиксированная политика (решение архитектора, не менять):** попытка primary с таймаутом 10 с (`AbortSignal.timeout`); при 5xx / таймауте / сетевой ошибке → fallback (если задан) с таймаутом 10 с; при его провале → пауза 1 с → ОДИН повтор primary; затем `SttError('stt_failed')` с `cause`. 4xx (кроме 408/429) — не ретраить, сразу `SttError('stt_http')`. Ошибки не логировать секретами. Таймаут и пауза — параметры с дефолтами (для тестов).
3. `lib/ai/stt-providers.ts` — четыре реализации `SttProvider` через `fetch` (без SDK), перенос из run.mjs: `openai-4o` (`gpt-4o-transcribe`, `prompt` = `hintsToPrompt(vocabularyHints)`, `language` только если `opts.language` не null), `whisper1`, `deepgram` (`nova-3`, keyterm), `elevenlabs` (Scribe). Ключи — из `process.env` (`OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`); `durationMs` — замер вызова. Тест `lib/ai/stt.test.ts` с фейковыми провайдерами (без сети): (а) primary ок → fallback не вызывается; (б) primary 503 → fallback вызван, результат его; (в) primary таймаут (таймаут в тесте 50 мс), fallback ошибка → повтор primary → если ок, результат primary с `provider` primary; (г) все упали → `SttError('stt_failed')`; (д) primary 400 → сразу `stt_http`, fallback не вызывается.
4. `lib/ai/stt-guard.ts` — чистая функция `guardTranscript(input: { text: string; durationMs: number; vocabularyHints: string[] }): GuardResult`, где `GuardResult = { ok: true; suspicious: boolean; reason?: GuardCode } | { ok: false; code: GuardCode }`, `GuardCode = 'too_dense' | 'phantom' | 'too_short' | 'prompt_echo' | 'loop' | 'low_density'`. Правила — ровно (б)–(ж) из AI.md §1, порядок проверки: too_short → phantom → prompt_echo → loop → too_dense → low_density. Детали: плотность = `chars(normalize(text)) / (durationMs/1000)`; `prompt_echo` — нормализованный текст содержит подстроку из ≥4 подряд идущих слов нормализованной строки `hintsToPrompt(hints)` ИЛИ ≥60% слов текста входят в множество слов подсказки (только для текстов ≥3 слов); `loop` — одна фраза (последовательность ≥2 слов) повторена ≥2 раз подряд и покрывает >70% слов; `low_density` — при `durationMs > 3000`: <4 симв/сек → `ok:false`, <6 → `ok:true, suspicious:true, reason:'low_density'`. Список фантомов — константа `PHANTOMS` (из AI.md (в), сравнение по нормализованному тексту, по вхождению). Тест `lib/ai/stt-guard.test.ts` — по кейсу на каждый код плюс живые кейсы 2026-08-20: `"Контрагенты и объекты. Контрагенты и объекты."` при подсказке с «Контрагенты и объекты» → `ok:false` (код `prompt_echo` или `loop` — тест принимает любой из двух); `"Продолжение следует..."` → `phantom`; нормальная фраза 9 с / 120 симв → `ok:true, suspicious:false`; 5 с / 22 симв → `suspicious:true`; 5 с / 15 симв → `ok:false, low_density`.
5. Никаких вызовов сети в тестах; `fetch` в провайдерах не мокать — провайдеры проверяются гейтом `pnpm test:stt`, не юнитами.

## Проверки (обязательные, машинные)
```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
Все должны завершиться успешно. Красная проверка = чинить в рамках скоупа, не расширяя его.

## Definition of Done
- [ ] Шаги выполнены, проверки зелёные.
- [ ] Коммит(ы): conventional commits, мелкие; подпись `Co-Authored-By` — своей моделью исполнителя (не Fable).
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 002 stt-lib` + Сделано/Коммиты/Вопросы.
- [ ] Отчёт в чат: что сделано, вывод команд проверок (кратко), открытые вопросы. Файлы не пересказывать.
