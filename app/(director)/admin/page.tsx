"use client";

import { useState } from "react";

import { DataTable, type TableSpec } from "@/components/admin/DataTable";
import { Chip } from "@/components/ui/Chip";
import { PageHead } from "@/components/ui/PageHead";

/**
 * Admin: the company's tables as readable grids. Read-only, under the director's RLS —
 * nothing here can see another company (V-02) and nothing here writes.
 */
const TABLES: TableSpec[] = [
  {
    table: "tasks",
    title: "Задачи",
    hint: "все поручения компании",
    orderBy: "created_at",
    columns: [
      { key: "created_at", label: "Создана", kind: "time" },
      { key: "title", label: "Заголовок", width: 220 },
      { key: "status", label: "Статус" },
      { key: "assignee_id", label: "Исполнитель", kind: "id" },
      { key: "author_id", label: "Автор", kind: "id" },
      { key: "deadline", label: "Дедлайн", kind: "time" },
      { key: "priority", label: "Приоритет" },
      { key: "source", label: "Источник" },
      { key: "group_id", label: "Группа", kind: "id" },
      { key: "closed_at", label: "Закрыта", kind: "time" },
      { key: "id", label: "id", kind: "id" },
    ],
  },
  {
    table: "task_messages",
    title: "Сообщения",
    hint: "события и переписка по задачам, курсор seq",
    orderBy: "seq",
    columns: [
      { key: "seq", label: "seq", kind: "number" },
      { key: "created_at", label: "Время", kind: "time" },
      { key: "type", label: "Тип" },
      { key: "content", label: "Текст", width: 220 },
      { key: "meta", label: "meta", kind: "json" },
      { key: "task_id", label: "Задача", kind: "id" },
      { key: "sender_id", label: "От", kind: "id" },
    ],
  },
  {
    table: "profiles",
    title: "Люди",
    hint: "ростер компании",
    orderBy: "full_name",
    ascending: true,
    columns: [
      { key: "full_name", label: "Имя", width: 160 },
      { key: "role", label: "Роль" },
      { key: "position", label: "Должность" },
      { key: "aliases", label: "Алиасы" },
      { key: "availability", label: "Доступность" },
      { key: "is_active", label: "Активен", kind: "bool" },
      { key: "manager_id", label: "Руководитель", kind: "id" },
      { key: "telegram_chat_id", label: "Telegram" },
      { key: "id", label: "id", kind: "id" },
    ],
  },
  {
    table: "point_transactions",
    title: "Очки",
    hint: "append-only, баланс = сумма",
    orderBy: "created_at",
    columns: [
      { key: "created_at", label: "Время", kind: "time" },
      { key: "user_id", label: "Кому", kind: "id" },
      { key: "amount", label: "Сумма", kind: "number" },
      { key: "reason", label: "Причина", width: 200 },
      { key: "source", label: "Источник" },
      { key: "rule_code", label: "Правило" },
      { key: "actor_id", label: "Кто", kind: "id" },
      { key: "task_id", label: "Задача", kind: "id" },
    ],
  },
  {
    table: "ai_logs",
    title: "AI-логи",
    hint: "каждый вызов STT и парсера: токены, латентность, правки директора",
    orderBy: "created_at",
    columns: [
      { key: "created_at", label: "Время", kind: "time" },
      { key: "kind", label: "Вид" },
      { key: "status", label: "Статус" },
      { key: "model", label: "Модель" },
      { key: "transcript", label: "Транскрипт", width: 240 },
      { key: "was_edited", label: "Правлено", kind: "bool" },
      { key: "edit_fields", label: "Поля" },
      { key: "input_tokens", label: "Вход", kind: "number" },
      { key: "cache_read_tokens", label: "Кэш", kind: "number" },
      { key: "output_tokens", label: "Выход", kind: "number" },
      { key: "stt_ms", label: "STT мс", kind: "number" },
      { key: "parse_ms", label: "Разбор мс", kind: "number" },
      { key: "parsed_entities", label: "Сущности", kind: "json" },
      { key: "client_request_id", label: "crid", kind: "id" },
    ],
  },
  {
    table: "inbox_items",
    title: "Черновики голосового",
    hint: "recorded → transcribed → parsed → confirmed",
    orderBy: "created_at",
    columns: [
      { key: "created_at", label: "Время", kind: "time" },
      { key: "status", label: "Статус" },
      { key: "transcript", label: "Транскрипт", width: 240 },
      { key: "audio_path", label: "Аудио", width: 200 },
      { key: "entities", label: "Сущности", kind: "json" },
      { key: "client_request_id", label: "crid", kind: "id" },
    ],
  },
  {
    table: "announcements",
    title: "Объявления",
    hint: "Эфир",
    orderBy: "created_at",
    columns: [
      { key: "created_at", label: "Время", kind: "time" },
      { key: "transcript", label: "Текст", width: 300 },
      { key: "audio_path", label: "Аудио" },
      { key: "author_id", label: "Автор", kind: "id" },
    ],
  },
  {
    table: "ingest_batches",
    title: "Идемпотентность",
    hint: "client_request_id каждой мутации и её сохранённый результат",
    orderBy: "created_at",
    columns: [
      { key: "created_at", label: "Время", kind: "time" },
      { key: "client_request_id", label: "crid", kind: "id" },
      { key: "user_id", label: "Кто", kind: "id" },
      { key: "result", label: "Результат", kind: "json" },
    ],
  },
  {
    table: "companies",
    title: "Компания",
    hint: "settings — вся конфигурация инстанса",
    orderBy: "created_at",
    columns: [
      { key: "name", label: "Название" },
      { key: "settings", label: "settings", kind: "json" },
      { key: "created_at", label: "Создана", kind: "time" },
      { key: "id", label: "id", kind: "id" },
    ],
  },
];

export default function AdminPage() {
  const [active, setActive] = useState(TABLES[0].table);
  const spec = TABLES.find((t) => t.table === active) ?? TABLES[0];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-36 pt-5">
      <PageHead title="Данные" sub="Таблицы компании как есть, только чтение. Под правами директора: чужих компаний здесь нет" />

      <div className="mt-4 flex flex-wrap gap-2">
        {TABLES.map((t) => (
          <Chip key={t.table} tone={t.table === active ? "accent" : "neutral"} onClick={() => setActive(t.table)}>
            {t.title}
          </Chip>
        ))}
      </div>

      <div className="mt-4">
        <DataTable key={spec.table} spec={spec} />
      </div>
    </main>
  );
}
