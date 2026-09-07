# tasks/001-bootstrap.md — Каркас Next.js-проекта и инструментарий

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропускать нельзя). Семантическое ревью сделает отдельная сессия. Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай.

## Контекст (читать только это)
- `CLAUDE.md` — разделы «Стек» и «Структура репозитория» (только их).
- `docs/SETUP.md` §2 (таблица env-переменных) и §3 п.1.
- `docs/TESTING.md` §1 (таблица команд).
- Решения: D-39 (стек финализирован), D-19 (два окружения).
- Факт среды: Node 24, npm 11, `pnpm` НЕ установлен; Supabase CLI и Docker есть (в этом наряде не нужны).

## Ветка и скоуп
- Ветка: `feat/001-bootstrap` от `main`.
- Трогать только: корневые конфиги проекта (`package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.*`, `postcss.config.*`, `eslint.config.*`, `vitest.config.ts`, `.env.example`, `.gitignore`), каталоги `app/`, `lib/`, `public/`, `tests/` (кроме `tests/stt/*`), `WORKLOG.md`. Всё остальное (docs/, DECISIONS.md, README.md, tests/stt/, archive/) — вне скоупа.

## Шаги
1. Установить pnpm: `corepack enable pnpm` → `pnpm -v`. Если corepack недоступен — `npm i -g pnpm`. В `package.json` после генерации добавить поле `"packageManager": "pnpm@<установленная версия>"` и `"engines": { "node": ">=20" }`.
2. Сгенерировать каркас во ВРЕМЕННОМ каталоге (create-next-app отказывается работать в непустом): `pnpm dlx create-next-app@latest ../pulse-bootstrap --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm` (на вопрос про Turbopack — по умолчанию). Затем скопировать в корень репозитория ВСЁ содержимое, кроме `README.md`, `.git`, `node_modules`; строки `.gitignore` из шаблона добавить в существующий `.gitignore` только если их там нет (существующий файл не переписывать). Временный каталог удалить.
3. `tsconfig.json`: убедиться, что `"strict": true`. Других опций компилятора не добавлять.
4. Вычистить шаблон: `app/page.tsx` — минимальная страница с заголовком «Pulse» и строкой «Каркас проекта. Интерфейс появится после СТТ-гейта.» (тёмный фон `#0B0F14`, текст `#E6EDF3`, без упоминаний клиента). Удалить шаблонные SVG из `public/`. `app/layout.tsx`: `lang="ru"`, `<title>` «Pulse».
5. Добавить `app/api/health/route.ts`: `GET` → JSON `{ ok: true, version, time }`, где `version` — из `package.json` (импорт с `assert`/`with { type: "json" }` или через `process.env.npm_package_version` — что компилируется без ошибок), `time` — ISO UTC. `export const dynamic = "force-dynamic"`.
6. Добавить `lib/env.ts` (server-only): `import "server-only"`; функция `getServerEnv()` — читает и валидирует через `zod` переменные из таблицы SETUP.md §2 (обязательные: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`; остальные — optional). Ошибка валидации должна называть имя переменной. Функцию `getPublicEnv()` для `NEXT_PUBLIC_*` — в отдельном файле `lib/env.public.ts` без `server-only`. Валидатор вынести в `lib/env.schema.ts` (без `server-only`), чтобы тестировать без Next-рантайма. Установить `zod` и `server-only`.
7. `.env.example` — все переменные из SETUP.md §2 плюс: `STT_FALLBACK_PROVIDER`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, `PARSER_MODEL=claude-haiku-4-5`, `PARSER_ESCALATION_MODEL=claude-sonnet-5`, `QUERY_MODEL=claude-sonnet-5`, `CRON_SECRET`. Каждая переменная — с комментарием на русском в одну строку, без значений (кроме дефолтов моделей и `STT_PROVIDER=openai`).
8. Vitest: установить `vitest` (dev). `vitest.config.ts`: `test.include = ["lib/**/*.test.ts", "tests/**/*.test.ts"]`, `environment: "node"`. Тест `lib/env.schema.test.ts`: (а) полный набор → ок; (б) без `ANTHROPIC_API_KEY` → ошибка, в сообщении есть `ANTHROPIC_API_KEY`.
9. `package.json` scripts: `dev`, `build`, `start`, `lint`, `typecheck` = `tsc --noEmit`, `test` = `vitest run`, `test:stt` = `node tests/stt/run.mjs`. Скрипты `eval:parser` и `test:rls` НЕ добавлять (появятся в нарядах 004/005).
10. Убедиться, что `tests/stt/*` не попадает в сборку/линт Next (каталог вне `app/`; при необходимости добавить `tests/stt` в `ignores` eslint-конфига — это единственное допустимое изменение конфига ради него).

## Проверки (обязательные, машинные)
```powershell
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
node tests/stt/run.mjs 2>&1 | Select-Object -First 3   # скрипт гейта не сломан (ожидается сообщение об отсутствии фикстур/ключа, не исключение синтаксиса)
git status --short                                    # нет неожиданных файлов (например, ../pulse-bootstrap, .next в индексе)
```
Все должны завершиться успешно. Красная проверка = чинить в рамках скоупа, не расширяя его.

## Definition of Done
- [ ] Шаги выполнены, проверки зелёные.
- [ ] Коммит(ы): conventional commits, мелкие; подпись `Co-Authored-By` — своей моделью исполнителя (не Fable).
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 001 bootstrap` + Сделано/Коммиты/Вопросы (в т.ч. версии Next/React/Tailwind, которые поставил create-next-app).
- [ ] Отчёт в чат: что сделано, вывод команд проверок (кратко), открытые вопросы. Файлы не пересказывать.
