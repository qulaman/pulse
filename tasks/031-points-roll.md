# tasks/031-points-roll.md — Очки как табло и полёт «+N» в счётчик

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропускать нельзя). Семантическое ревью сделает отдельная сессия. Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай. Идею или техдолг вне скоупа не делай — запиши одной строкой в `IDEAS.md`, раздел «Входящие» (с номером наряда).

## Зачем (D-165)

Сейчас при начислении очков маскот в Ленте ловит монету, а под лицом всплывает пилюля «+N очков» (D-110). Число очков при этом меняется скачком.

Что делаем:
1. **Табло.** Числа очков прокручиваются цифрами, как табло, — `@number-flow/react` за одной своей обёрткой. Пакет можно снять, поменяв один файл.
2. **Полёт.** При начислении золотое «+N» отрывается от пилюли и летит по дуге в счётчик под именем в шапке — `arc()` из `motion/react`.

Правила:
- Данные пишутся и показываются сразу; эффект играет поверх и ничего не задерживает (принцип 1a). Счётчик крутится, когда пришёл баланс. Подгонять его под конец полёта не нужно.
- Крутится только рост. Уменьшение меняется сразу, без движения: при штрафе ничего не играет, а на рейтинге и стене чужой минус не подсвечивается (D-45). Исключение — баланс в магазине после своего заказа: там число прокручивается вниз.
- При «уменьшить движение» числа меняются сразу, полёта нет. Пилюля остаётся, как сейчас.

## Зависимость
Наряд 030 (motion 14) сделан: в `package.json` стоит `motion`, импорт — `motion/react`. Если нет — СТОП.

## Контекст (читать только это)
- `CLAUDE.md` — принципы 1a и 4.
- `DECISIONS.md` — **только** D-165, D-45, D-110, D-131.
- `app/(employee)/feed/page.tsx` — строки около `usePointsArrival` и пилюли `face-pill`.
- `components/HeaderPoints.tsx`, `components/AppHeader.tsx` (где стоит `HeaderPoints`).
- `lib/points/queries.ts` — `usePointsArrival`; `lib/shop/queries.ts` — `useBalance`.
- Документация пакета: https://number-flow.barvian.me (React, SSR, `trend`, `animated`, `respectMotionPreference`, `locales`) и https://motion.dev/docs/arc.

## Рабочая папка и файлы
- `Z:\Pulse`, ветка `main`. Worktree не создавать, ветки не переключать, не коммитить.
- **Трогать только:**
  - `package.json`, `pnpm-lock.yaml`;
  - новые: `components/ui/RollingNumber.tsx`, `components/pulse/PointsFlight.tsx`, `app/dev/points/page.tsx`;
  - правки: `components/HeaderPoints.tsx`, `app/(employee)/feed/page.tsx` (только подключить полёт), `components/shop/ShopFront.tsx`, `components/rating/RatingList.tsx`, `components/rating/Podium.tsx`, `components/tv/TvLeaders.tsx`, `components/tv/TvRating.tsx`.
- Доки не трогать: какие фразы в `docs/FRONTEND.md` («Game Feel») и `docs/DESIGN.md` поменять, напиши в отчёте.

## Шаги

0. **Можно ли ставить пакет.** Условия — оба сразу:
   - `git status --short -- app components lib` не показывает изменённых (`M`) файлов, кроме песочницы `app/dev/pulse-alt/` и правок наряда 030, если он ещё не закоммичен;
   - тимлид или владелец подтвердил, что соседние сессии не правят код.

   Иначе — СТОП. Затем `pnpm add @number-flow/react@^0.6`. Проверь `git diff package.json`: добавилась одна строка.
1. **`components/ui/RollingNumber.tsx`** (`"use client"`) — единственное место в коде, которое импортирует `@number-flow/react`.
   - Пропсы: `value: number`, `rollDown?: boolean` (по умолчанию `false`), `className?`, `style?`.
   - Формат `ru-RU`, без дробей.
   - Анимация только при росте или при `rollDown`; при уменьшении без `rollDown` — смена без анимации.
   - Учитывает «уменьшить движение».
   - Цифры той же ширины, что сейчас (класс `nums`).
   - Первый рендер на клиенте совпадает с серверным, иначе ошибка гидратации `#418`.
2. **Подменить число** на `RollingNumber`. Слово «очко / очка / очков», цвета, заглушки загрузки и `data-testid` остаются как есть.
   - `HeaderPoints.tsx`
   - `ShopFront.tsx` — баланс, `rollDown`
   - `RatingList.tsx` — очки в строке
   - `Podium.tsx`
   - `TvLeaders.tsx` — оба места
   - `TvRating.tsx`
3. **`components/pulse/PointsFlight.tsx`** (`"use client"`) — слой поверх экрана, `pointer-events: none`, `position: fixed`.
   - Когда в Ленте играет начисление (тот же `arrival.key`, что включает монету), золотое «+N» стартует от пилюли `face-pill` и летит по `arc()` в счётчик.
   - Цель — элемент с `data-points-target` на `HeaderPoints`: добавь атрибут. Координаты меряются в момент старта.
   - Анимируются только `transform` и `opacity` (D-45). Полёт около 0,7 с, в конце «+N» гаснет.
   - Если цели нет на экране (шапка без очков, у секретаря) или включено «уменьшить движение», полёта нет.
   - Подключить в `feed/page.tsx` рядом с пилюлей, одной строкой JSX.
4. **Песочница `app/dev/points/page.tsx`** — смотреть всё без начисления живых очков.
   - Кнопки: `+5`, `−10`, «Заказ −30 (магазин)».
   - На экране: счётчик в шапке, строка рейтинга и полёт от фальшивой пилюли.
5. **Проверки** — ниже.

## Проверки (обязательные, машинные; pnpm для проверок не запускать)

```powershell
node node_modules/typescript/bin/tsc --noEmit -p .
node node_modules/eslint/bin/eslint.js components/ui/RollingNumber.tsx components/pulse/PointsFlight.tsx app/dev/points components/HeaderPoints.tsx "app/(employee)/feed/page.tsx" components/shop/ShopFront.tsx components/rating components/tv/TvLeaders.tsx components/tv/TvRating.tsx
node node_modules/vitest/vitest.mjs run
node node_modules/tsx/dist/cli.mjs scripts/smoke-stages.ts
node node_modules/tsx/dist/cli.mjs scripts/smoke-jank.ts
```

- **Глазами в песочнице** `/dev/points` — системный Chrome, ширина 390, DPR 3, раскадровка 10 кадров на полёт в свою папку scratchpad:
  - `+5`: «+5» летит дугой в счётчик, счётчик крутится вверх;
  - `−10`: число меняется сразу, без движения;
  - «Заказ −30»: крутится вниз;
  - с `reducedMotion: 'reduce'`: ни полёта, ни прокрутки.
- **Живые экраны без записи данных:** `/feed`, `/rating`, `/shop` и стена в `/dev/tv` — числа на месте, вёрстка не прыгнула. Начислять очки на dev не нужно: на телефоны людей уйдут пуши.
- **Гидратация:** под `next dev` на `/feed`, `/rating`, `/shop`, `/dev/tv` в консоли нет `#418` и `Hydration` — `pageerror` и `console` за прогон.
- **Покой:** на `/feed` без касаний 10 с при CPU ×4 (`Emulation.setCPUThrottlingRate`, `Performance.getMetrics`) `TaskDuration` не выросла против замера до правки. Обе цифры — в WORKLOG.

Все должны завершиться успешно. Красная проверка = чинить в рамках скоупа, не расширяя его.

## Вне скоупа наряда (не делать; идеи — в `IDEAS.md`, «Входящие»)
- Конфетти и любые библиотеки эффектов: `canvas-confetti` не берём (D-165).
- Полёт очков в отчёте (`PointsPop`), на Пульсе директора и на стене.
- Числа на компьютере (`/desk`) и в `/ops`.
- Звук и новые узоры вибрации.

## Definition of Done
- [ ] Шаги выполнены, проверки зелёные.
- [ ] Коммит не делать: коммит — по слову владельца.
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 031 points-roll` + Сделано/Проверки/Вопросы.
- [ ] Отчёт в чат: вывод проверок (кратко), путь к раскадровке, фразы доков на замену, открытые вопросы.
