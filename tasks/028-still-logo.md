# tasks/028-still-logo.md — Логотип клиента — неподвижным кадром на всех экранах телефона, входа и стены

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропускать нельзя). Семантическое ревью сделает отдельная сессия. Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай. Идею или техдолг вне скоупа не делай — запиши одной строкой в `IDEAS.md`, раздел «Входящие» (с номером наряда).

## Зачем (D-155 п.6, В-9, D-131 п.2)

Логотип клиента на dev — SVG с SMIL-бликом (`<animateTransform>`). На Пульсе и в Ленте он один держит основной поток: в покое 5,5–5,8 с из 10 при CPU ×4, а с неподвижным логотипом — 0,04–0,11 с.

Решение владельца:
- любой загруженный логотип браузер рисует **один раз** и показывает этот кадр;
- анимация внутри файла не играет — SMIL, CSS внутри SVG, анимированный WebP или PNG;
- файл в бакете `brand` не меняется, блик пропадает.

Продукт так защищён от любого файла, который пришлёт клиент.

## Контекст (читать только это)
- `CLAUDE.md` — принципы 1a и 10.
- `DECISIONS.md` — **только** D-155 п.6 и строка В-9 в «Ждёт владельца».
- Места показа логотипа — найди сам: `grep -rn "logoUrl" components app --include=*.tsx`. Твои — `components/AppHeader.tsx`, `components/auth/Arrival.tsx`, `components/auth/LoginForm.tsx`, `components/tv/TvClock.tsx` и предпросмотр в `components/settings/CompanyForm.tsx`.
- `app/api/company/logo/route.ts` — какие типы файлов принимаются: png, jpeg, webp, svg.
- Память про охоту на #418 — расхождение гидратации: первый рендер на клиенте обязан совпасть с серверным.

## Владение файлами (чужое не трогать)

| Наряд | Файлы |
|---|---|
| **028 (этот)** | `components/ui/StillLogo.tsx`, `lib/ui/stillLogo.ts` (+ тест; чистая логика размеров и кэш), `components/AppHeader.tsx`, `components/auth/Arrival.tsx`, `components/auth/LoginForm.tsx`, `components/tv/TvClock.tsx`, `components/settings/CompanyForm.tsx` (только картинка предпросмотра) |
| 026 (параллельно) | `supabase/migrations/20261103120000_*`, `lib/daily-report/**`, `components/daily-report/**`, `app/report/**`, `app/api/daily-report/**`, `components/settings/sections.tsx` |
| 027 (параллельно) | `supabase/migrations/20261103121000_*`, `app/api/push/sweep/route.ts`, `lib/voice/retention*`, `components/settings/VoiceRetentionSection.tsx`, `components/settings/SettingsTabs.tsx`, `app/lab/**`, `components/lab/**` |
| Архитектор | `DECISIONS.md`, `docs/**`, `lib/settings.ts`, `components/settings/draft.tsx` |
| Сессия десктопа (D-154, идёт сейчас) | `app/desk/**`, `components/desk/**` (в том числе логотип в `DeskShell`), `lib/desk/**`, `app/globals.css`, `docs/DESIGN.md`, `scripts/smoke-desk.ts` |

**Общие для всех:** `WORKLOG.md` — одна запись в конец файла; `IDEAS.md` — только новые строки в конец «Входящих». Перед каждой правкой файл перечитать: соседи пишут туда же. Доки не трогать: какие фразы в них поменять, напиши в отчёте, правит архитектор.

## Шаги

0. **Замер «до»** — до любой правки кода. Системный Chrome через Playwright, ширина 390.
   - Вход — `test@demo.local`, пароль как в `scripts/smoke-desk.ts`. Ничего не отправлять и не сохранять: это телефон владельца.
   - `/pulse` в покое: CDP `Emulation.setCPUThrottlingRate { rate: 4 }`, затем `Performance.getMetrics` → разница `TaskDuration` за 10 с без касаний. Три прогона.
   - Логотип у компании dev есть, и он с SMIL. Проверь это, без логотипа замер не имеет смысла: если его нет — СТОП и вопрос.
1. **`components/ui/StillLogo.tsx`** — `<StillLogo src className alt?>` вместо `<img src={logoUrl} …>`. Как работает:
   - **Первый рендер** на сервере и на клиенте одинаковый: пустой `<span>` с тем же `className` и `aria-hidden`, чтобы не было #418. Кадр появляется после `useEffect`. Готовый кадр из кэша тоже ставится в эффекте, не в начальном состоянии.
   - **Снимок.** `new Image()` с `crossOrigin = "anonymous"`, `decoding = "async"`. После `load` картинка рисуется один раз на `canvas`, и `canvas.toBlob("image/png")` даёт `URL.createObjectURL` для `<img src={blobUrl} className={className} alt={alt ?? ""}>` — те же классы, что были у картинки.
   - **Размер холста.**
     - Растровая картинка — родной размер, не больше 1024 по длинной стороне.
     - Векторная (`.svg` в пути или `image/svg+xml` по `fetch`-заголовку — выбери одно, проще) — растянуть до 512 по длинной стороне с родными пропорциями, чтобы кадр был чётким на 3× экране и на стене.
     - Размер не определился (`naturalWidth = 0`) — показать исходный файл как раньше и один раз написать `console.warn`.
   - **Кэш** — на уровне модуля, `Map<src, Promise<string | null>>`: повторный показ того же логотипа (переход между вкладками) рисует сразу, без нового снимка. Blob-адреса не отзывать: логотипов единицы.
   - **Сбой** — `toBlob` бросил `SecurityError` (нет CORS) или картинка не загрузилась. Показать исходный файл как раньше и один раз написать `console.warn` с причиной. Экран не ломается ни при каком сбое.
   - Чистая логика — размер холста и признак вектора — в `lib/ui/stillLogo.ts`, тест рядом.
2. **Заменить показ** в `AppHeader.tsx`, `Arrival.tsx`, `LoginForm.tsx`, `TvClock.tsx` и в картинке предпросмотра `CompanyForm.tsx`. Предпросмотр после выбора файла может быть `blob:`-адресом — `StillLogo` с ним тоже работает. Классы, `alt` и разметку вокруг не менять. Комментарии `eslint-disable-next-line @next/next/no-img-element` переезжают в `StillLogo` с той же причиной.
3. **Десктоп** (`DeskShell`) не трогать. В отчёте — одна строка для сессии десктопа: «логотип — `<StillLogo src={brand.logoUrl} className=…/>` из `components/ui/StillLogo`».
4. **`WORKLOG.md`**: `## 2026-11-03 — Исполнитель (Opus) — 028 still-logo` + Сделано / Проверки (замер до/после цифрами) / Не проверено / Вопросы / Доки.

## Проверки (обязательные, машинные; pnpm не запускать совсем)

```powershell
node node_modules/typescript/bin/tsc --noEmit -p .
node node_modules/eslint/bin/eslint.js components/ui/StillLogo.tsx lib/ui/stillLogo.ts components/AppHeader.tsx components/auth/Arrival.tsx components/auth/LoginForm.tsx components/tv/TvClock.tsx components/settings/CompanyForm.tsx
node node_modules/vitest/vitest.mjs run lib/ui
```

- **Замер «после»** — тот же сценарий, что в шаге 0. В шапке `/pulse` у логотипа `img.src` начинается с `blob:`. Покой при CPU ×4 — порядка десятых долей секунды из 10: цифры до и после — в WORKLOG.
- **Глазами** — скриншоты в свою папку scratchpad, сравнить с исходным файлом: логотип не сплющен, чёткий, на своём месте.
  - Шапка `/pulse` — ширина 390, DPR 3.
  - `/login` и `/c/<slug>` компании dev (прибытие) — без входа.
  - Стена — песочница `/dev/tv`, если логотип там виден через `TvClock`.
- **Гидратация:** прод-сборка не нужна. Под `next dev` на `/pulse` и `/login` в консоли нет `#418` и `Hydration` — `pageerror` и `console` за прогон.
- **Сбой CORS** — vitest или ручная подмена: исходный файл показывается, экран не падает.
- tsc: ошибки в чужих файлах (соседи работают параллельно) не чинить, перечислить в отчёте. В своих — 0.

Красная проверка = чинить в рамках скоупа, не расширяя его.

## Вне скоупа наряда (не делать; идеи — в `IDEAS.md`, «Входящие», с пометкой «028»)
- Свой блик CSS поверх логотипа — владелец его не просил.
- Обработка файла при загрузке (растр на сервере, вырезание `<animate*>`) — файл не меняем.
- Десктоп (`components/desk/**`), `app/globals.css`.
- Коммит, ветки, worktree — не делать.
