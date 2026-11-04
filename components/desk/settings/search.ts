import type { SettingsTab } from "@/lib/settings-tabs";

/**
 * Every setting of the desk's «Настройки» and the screens beside them, as the settings search
 * finds them (D-154 wave 3): what it is called, where it lives, and the words people look for it
 * by. `id` is the row's anchor (`set-<id>`) on its tab; a screen's entry has an `href` instead.
 */
export type SettingEntry = {
  id: string;
  title: string;
  /** Where it lives: «Компания», «ИИ-модель», «Словарь»… */
  place: string;
  tab?: SettingsTab;
  href?: string;
  words?: string;
  director?: boolean;
};

export const SETTINGS_INDEX: SettingEntry[] = [
  // Компания
  { id: "brand-name", tab: "company", place: "Компания", title: "Название компании", words: "имя фирма тоо" },
  { id: "brand-tagline", tab: "company", place: "Компания", title: "Подпись на экране входа", words: "слоган вход" },
  { id: "brand-logo", tab: "company", place: "Компания", title: "Логотип", words: "лого картинка файл бренд" },
  { id: "brand-accent", tab: "company", place: "Компания", title: "Акцентный цвет", words: "цвет бренд акцент контраст" },
  { id: "window-hours", tab: "company", place: "Компания", title: "Тихие часы — когда доставлять уведомления", words: "пуш ночь утро уведомления доставка окно" },
  // Программа
  { id: "secretary-buttons", tab: "app", place: "Программа", title: "Кнопки секретаря", words: "кофе чай охрана врач заявки зайди" },
  { id: "secretary-phone", tab: "app", place: "Программа", title: "Телефон охраны", words: "тревога позвонить" },
  { id: "secretary-repeat", tab: "app", place: "Программа", title: "Повтор пуша секретарю", words: "напомнить заявка минут" },
  { id: "mascot-seasons", tab: "app", place: "Программа", title: "Праздничные наряды маскота", words: "новый год наурыз колпак лицо" },
  { id: "mascot-telegraph", tab: "app", place: "Программа", title: "Лицо сотрудника переживает за дела", words: "маскот волнуется зовёт" },
  // Сотрудники
  { id: "points-enabled", tab: "team", place: "Сотрудники", title: "Очки включены", words: "баллы рейтинг магазин" },
  { id: "rating-mode", tab: "team", place: "Сотрудники", title: "Кто видит рейтинг целиком", words: "топ-5 топ рейтинг" },
  { id: "points-quick", tab: "team", place: "Сотрудники", title: "Очки за быстрое «Принял»", words: "быстро минут принял" },
  { id: "points-on-time", tab: "team", place: "Сотрудники", title: "Очки за сдачу в срок", words: "срок досрочно" },
  { id: "points-late", tab: "team", place: "Сотрудники", title: "Штраф за просрочку", words: "минус просрочка опоздание" },
  { id: "points-report", tab: "team", place: "Сотрудники", title: "Очки за отчёт за день", words: "отчёт штраф несданный" },
  { id: "points-reactions", tab: "team", place: "Сотрудники", title: "Цена реакций директора", words: "лайк огонь сердце реакция" },
  { id: "points-ether", tab: "team", place: "Сотрудники", title: "Что попадает в Эфир", words: "похвала награды эфир" },
  { id: "report-enabled", tab: "team", place: "Сотрудники", title: "Ежедневный отчёт", words: "отчёт конец дня", director: true },
  { id: "report-days", tab: "team", place: "Сотрудники", title: "Рабочие дни", words: "пн пт суббота выходные неделя", director: true },
  { id: "report-holidays", tab: "team", place: "Сотрудники", title: "Праздники компании", words: "выходной наурыз курбан", director: true },
  { id: "report-times", tab: "team", place: "Сотрудники", title: "Начало дня и напоминание об отчёте", words: "пришёл время напомнить", director: true },
  // ИИ-модель
  { id: "stt-provider", tab: "ai", place: "ИИ-модель", title: "Распознавание речи — провайдер", words: "stt openai whisper deepgram elevenlabs голос" },
  { id: "stt-language", tab: "ai", place: "ИИ-модель", title: "Язык речи", words: "казахский русский смешанная" },
  { id: "parser-model", tab: "ai", place: "ИИ-модель", title: "Модель разбора поручений", words: "claude haiku sonnet deepseek парсер" },
  { id: "parser-escalate", tab: "ai", place: "ИИ-модель", title: "Перепроверка сильной моделью", words: "эскалация вторая модель" },
  { id: "parser-kinds", tab: "ai", place: "ИИ-модель", title: "Что модель различает", words: "виды объявления напоминания встречи заметки" },
  { id: "parser-rules", tab: "ai", place: "ИИ-модель", title: "Правила компании для разбора", words: "промпт правила корпус" },
  { id: "conventions", tab: "ai", place: "ИИ-модель", title: "Слова о сроках", words: "до обеда к вечеру утро срок дедлайн" },
  { id: "retention", tab: "ai", place: "ИИ-модель", title: "Хранение записей", words: "аудио голосовые удалять дней" },
  // the screens beside the tabs
  { id: "page-names", href: "/desk/settings/dictionary?tab=names", place: "Словарь", title: "Имена людей — как их зовут вслух", words: "прозвище алиас тёзки" },
  { id: "page-words", href: "/desk/settings/dictionary?tab=words", place: "Словарь", title: "Слова компании", words: "контрагенты объекты словарь термины" },
  { id: "page-lab", href: "/desk/settings/lab", place: "Лаборатория", title: "Сравнение моделей", words: "лаб модели стоимость" },
  { id: "page-lab-parser", href: "/desk/settings/lab?tab=parser", place: "Лаборатория", title: "Парсер: правила и песочница", words: "промпт корпус проверка" },
  { id: "page-lab-costs", href: "/desk/settings/lab?tab=costs", place: "Лаборатория", title: "Себестоимость клиента", words: "цена расходы деньги" },
  { id: "page-data", href: "/desk/settings/data", place: "Данные", title: "Таблицы компании", words: "база логи данные таблица", director: true },
  { id: "page-points", href: "/desk/settings/points", place: "Очки и магазин", title: "Балансы, споры и история очков", words: "начислить баланс спор", director: true },
  { id: "page-shop", href: "/desk/settings/points?view=shop", place: "Очки и магазин", title: "Магазин наград", words: "товар награда выдать заказ мерч", director: true },
];

const fold = (text: string) => text.toLowerCase().replace(/ё/g, "е").replace(/[«»"]/g, "");

/** The entries a query finds — every word of it somewhere in the title, the place or the words; titles first. */
export function searchSettings(query: string, options: { director: boolean }): SettingEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const allowed = SETTINGS_INDEX.filter((entry) => !entry.director || options.director);
  const scored = allowed
    .map((entry) => {
      const title = fold(entry.title);
      const hay = `${title} ${fold(entry.place)} ${fold(entry.words ?? "")}`;
      if (!words.every((word) => hay.includes(word))) return null;
      const score = words.reduce((sum, word) => sum + (title.startsWith(word) ? 3 : title.includes(word) ? 2 : 1), 0);
      return { entry, score };
    })
    .filter((item): item is { entry: SettingEntry; score: number } => item !== null);
  return scored.sort((a, b) => b.score - a.score).map((item) => item.entry);
}

/** Where an entry is opened: its screen, or its tab with the row to land on. */
export function entryHref(entry: SettingEntry): string {
  return entry.href ?? `/desk/settings?tab=${entry.tab}&focus=${entry.id}`;
}
