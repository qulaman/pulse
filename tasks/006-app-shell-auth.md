# tasks/006-app-shell-auth.md — Оболочка приложения: Supabase-клиенты, auth, роутинг по ролям, токены дизайна, провайдеры состояния

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропускать нельзя). Семантическое ревью сделает отдельная сессия. Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай.

## Контекст (читать только это)
- `docs/FRONTEND.md`: «Дизайн-принципы», «Навигация и роутинг» (таблица роутов и абзац про `middleware.ts`), «State management» (первые два пункта: TanStack Query, Zustand).
- `docs/DESIGN.md` §2 «Токены» (цвет, типографика, форма, движение) и §4 (tone of voice — для текстов экрана входа и профиля).
- `docs/BACKEND.md` §1 — сигнатуры `getSessionProfile()` / `requireRole()`.
- `docs/SETUP.md` §2 — env-переменные Supabase; `docs/DATABASE.md` — таблица `profiles` и функции `auth_company_id()/auth_role()`.
- Решения: D-19 (dev-проект), G.21 (вход на этапе разработки — email + пароль сид-пользователей; QR-инвайт + PIN по D-06 — отдельный наряд онбординга), G.16 (Next 16).
- Уже есть: `lib/env.ts`, `lib/env.schema.ts`, `lib/env.public.ts` (валидация env), seed-пользователи в dev (`director@demo.local`, `erlan.b@demo.local`, `tv@demo.local` …, пароль `demo1234`).
- Факты среды: Next 16.3 (в нём файл `middleware.ts` переименован в `proxy.ts` — использовать `proxy.ts`; если сборка не примет — вернуться к `middleware.ts` и записать в отчёт). Dev-проект Supabase слинкован (`supabase/.temp`), в `.env.local` есть `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (если нет — СТОП, запросить у владельца).

## Ветка и скоуп
- Ветка: `feat/006-app-shell-auth` от `main` (в `main` уже влиты 001–005; если `git log main --oneline -1` не показывает `feat(db): tv isolation…` — СТОП).
- Трогать только: `lib/supabase/*`, `lib/auth.ts`, `lib/design/tokens.ts`, `lib/store/ui.ts`, `proxy.ts`, `app/**` (layout, globals.css, page, `(auth)/login`, `(director)/*`, `(employee)/*`, `ether`, `profile`, `dev/*`, `api/me`), `components/**`, `scripts/smoke-auth.ts`, `package.json` (зависимости + scripts `db:types`, `smoke:auth`), `WORKLOG.md`. Миграции и route handlers голосового конвейера — НЕ здесь.

## Шаги
1. Зависимости: `@supabase/supabase-js`, `@supabase/ssr`, `@tanstack/react-query`, `zustand`. Скрипт `db:types` = `supabase gen types typescript --linked --schema public > lib/supabase/types.ts`; выполнить и закоммитить `lib/supabase/types.ts` (регенерируется каждым нарядом с миграцией).
2. `lib/supabase/server.ts` — `createServerSupabase()` через `createServerClient` из `@supabase/ssr` с cookie-адаптером `next/headers` (паттерн из README @supabase/ssr для App Router: `getAll`/`setAll`); `lib/supabase/client.ts` — `createBrowserSupabase()` (`createBrowserClient`, синглтон); `lib/supabase/service.ts` — `import "server-only"`, `createServiceSupabase()` на `SUPABASE_SERVICE_ROLE_KEY` (`auth: { persistSession: false }`). Все три типизированы `Database` из `types.ts`.
3. `lib/auth.ts` (server-only): `getSessionProfile(req?: Request): Promise<SessionProfile>` где `SessionProfile = { userId, companyId, role, isActive, fullName }`. Источник сессии: (а) заголовок `Authorization: Bearer <access_token>` если передан `req` (нужно скриптам, Telegram и смоукам) — проверять через `supabase.auth.getUser(token)`; (б) иначе cookies через `createServerSupabase()`. Профиль — `select id, company_id, role, is_active, full_name from profiles where id = auth.uid()` под RLS пользователя. Нет сессии/профиля → `throw new AuthError(401, 'unauthorized')`; `isActive === false` → `AuthError(403, 'inactive')`. `requireRole(profile, ...roles)` → `AuthError(403, 'forbidden')`. `class AuthError extends Error { status: 401|403; code: string }`.
4. `app/api/me/route.ts` — `GET` → `{ profile: SessionProfile }` или `{ error: { code, message_ru } }` со статусом из AuthError (формат ошибок BACKEND.md §0 п.4). `message_ru`: unauthorized → «Нужно войти», forbidden → «Нет доступа», inactive → «Аккаунт отключён».
5. `proxy.ts` (Next 16): обновление сессии Supabase по паттерну @supabase/ssr для proxy/middleware; нет сессии и путь не `/login`, не `/api/*`, не статика → redirect `/login`; есть сессия и путь `/` или `/login` → redirect по роли: `director` → `/pulse`, `tv` → `/tv` (страницы `/tv` пока нет — редирект на `/profile`), иначе → `/feed`. Роль читать одним запросом к `profiles` (под RLS пользователя). `matcher` исключает `_next`, `api`, файлы с расширением.
6. Токены дизайна: `lib/design/tokens.ts` — объект `tokens` (цвета, типографика, радиусы, длительности) ровно по DESIGN.md §2; `app/globals.css` — CSS-переменные `--bg … --overlay` и `--t-*` из того же файла (значения дублируются вручную — юнит-тест `lib/design/tokens.test.ts` читает `globals.css` и проверяет, что каждый цветовой токен из `tokens.ts` присутствует в CSS с тем же hex); Tailwind v4 `@theme` — маппинг цветов в утилиты (`bg-bg`, `bg-surface`, `text-text`, `text-muted`, `bg-accent`, `text-warn`, `text-danger`, `text-ok`, `text-gold`), шрифтовой стек системный, `font-variant-numeric: tabular-nums` для класса `.nums`. Тёмная тема единственная: `color-scheme: dark`, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `min-height: 100dvh`.
7. Оболочка: `app/layout.tsx` — `lang="ru"`, `<QueryProvider>` (`components/providers/QueryProvider.tsx`, TanStack `QueryClient` с `staleTime: 30_000`, `retry: 1`), без другого глобального состояния. `lib/store/ui.ts` — zustand-стор с единственным полем `quietMode: boolean` + `toggleQuietMode` (заготовка под FRONTEND «Тихий режим»). Route groups: `app/(director)/layout.tsx` — server component: `getSessionProfile()` → не director → `redirect('/feed')`; шапка с именем, `<TabBar role="director">` (Пульс / Эфир / Профиль). `app/(employee)/layout.tsx` — employee|manager, иначе `redirect('/pulse')`; `<TabBar role="employee">` (Лента / Дела / Эфир / Профиль). Страницы-заглушки с заголовком `h1` и текстом-плейсхолдером в tone of voice: `(director)/pulse`, `(employee)/feed`, `(employee)/tasks`, `app/ether/page.tsx` (все роли, layout с проверкой сессии), `app/profile/page.tsx` (имя, роль по-русски, кнопка «Выйти» — server action `signOut` → `/login`). `components/TabBar.tsx` — нижний бар, активная вкладка `--accent`, зона тапа ≥44px, `padding-bottom: env(safe-area-inset-bottom)`.
8. `app/(auth)/login/page.tsx` — форма email + пароль (client component, `createBrowserSupabase().auth.signInWithPassword`), после входа `router.replace('/')` (proxy разведёт по роли); ошибка входа — «Не удалось войти. Проверь почту и пароль» под полем; заголовок «Pulse», подпись «Голосовое управление компанией» (без упоминаний клиента). Тёмная палитра из токенов, кегль ≥16px, кнопки ≥44px.
9. `app/dev/layout.tsx` — `if (process.env.NODE_ENV === 'production') notFound()`; `app/dev/tokens/page.tsx` — все цветовые токены плашками с hex, типографика примерами. `app/page.tsx` — пустой server component с `redirect('/login')` (proxy перехватит раньше при наличии сессии).
10. `scripts/smoke-auth.ts` (скрипт `smoke:auth` = `tsx scripts/smoke-auth.ts`, читает `.env.local` через `process.loadEnvFile`): входит `director@demo.local`/`demo1234` через `@supabase/supabase-js` (anon key), (а) читает свой профиль под RLS — role = director; (б) читает `profiles` — 8 строк; (в) `GET http://localhost:3000/api/me` с `Authorization: Bearer <access_token>` → 200 и `role: "director"`; (г) без заголовка → 401; (д) входит `tv@demo.local` → `profiles` — 1 строка (своя). Печатает таблицу ок/ошибка, код выхода 1 при любом провале. Требует запущенного `pnpm dev`.

## Проверки (обязательные, машинные)
```powershell
pnpm install
pnpm db:types                      # lib/supabase/types.ts обновлён
pnpm typecheck
pnpm lint
pnpm test
pnpm build
# в отдельном терминале: pnpm dev
curl.exe -s -o NUL -w "%{http_code} %{redirect_url}\n" http://localhost:3000/pulse    # 307 → /login
curl.exe -s -o NUL -w "%{http_code}\n" http://localhost:3000/login                    # 200
curl.exe -s -o NUL -w "%{http_code}\n" http://localhost:3000/dev/tokens               # 200 в dev
pnpm smoke:auth                    # все строки ок
```
Все должны завершиться успешно. Красная проверка = чинить в рамках скоупа, не расширяя его. Визуальную проверку на телефоне (эмуляция iPhone SE / Android) сделает владелец при приёмке — в отчёте приложить скриншоты `/login`, `/feed`, `/pulse`, `/dev/tokens` (DevTools, ширина 375px), если есть возможность их снять; если нет — так и написать.

## Definition of Done
- [ ] Шаги выполнены, проверки зелёные.
- [ ] Коммит(ы): conventional commits, мелкие; подпись `Co-Authored-By` — своей моделью исполнителя (не Fable).
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 006 app-shell-auth` + Сделано/Коммиты/Вопросы (в т.ч. `proxy.ts` vs `middleware.ts`).
- [ ] Отчёт в чат: что сделано, вывод команд проверок (кратко), открытые вопросы. Файлы не пересказывать.
