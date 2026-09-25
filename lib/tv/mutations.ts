"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { createBrowserSupabase } from "@/lib/supabase/client";

import { tvKeys, type TvState } from "./queries";
import { boardUntilFrom, FOCUS_MS, WAKE_MS, type BoardView, type CalendarView, type ClockStyle, type RatingView, type TvScene } from "./state";

/**
 * Пульт от телевизора: единственная дверь к стене — RPC `tv_control` (D-76 §2).
 * Роут и service role не нужны — проверка роли живёт внутри функции.
 *
 * **Идемпотентности по `client_request_id` здесь намеренно нет** — сознательное
 * исключение из принципа 7 CLAUDE.md (D-76 §3): команда абсолютна, повтор даёт ту же
 * строку. По той же причине пульт не ставит команды в оффлайн-очередь: без сети
 * кнопка честно говорит «нет связи», а не обещает переключить экран когда-нибудь.
 */

const OFFLINE = "Нет связи с сервером, экран не переключён";
/**
 * Потолок ожидания. Без него телефон с умирающей сетью крутит кнопку бесконечно:
 * supabase-js вне сети не отвечает вовсе (замерено на 25 с), а пульту нужен ответ
 * сейчас — команда абсолютна, повтор безопаснее молчания.
 */
const TIMEOUT_MS = 12_000;

export type TvControlInput = {
  mode?: "ether" | "employee" | "task";
  employeeId?: string;
  /** Одно дело во весь экран (D-123). */
  taskId?: string;
  scene?: TvScene;
  guest?: boolean;
  reload?: boolean;
  /** Цифры или стрелки на стене (D-96). */
  clock?: ClockStyle;
  /** «Неделя» или «Месяц» в заставке «Календарь» (D-98). */
  calendar?: CalendarView;
  /** Поставить эту доску на стену (D-102). */
  board?: string;
  /** «Показать гостю» — доска на стене и при госте в кабинете (D-102 §7). */
  boardGuest?: boolean;
  /** Разбудить стену ночью на два часа (`true`) или вернуть ночь (`false`) (D-105). */
  wake?: boolean;
  /** Период заставки «Рейтинг»: неделя или месяц (D-123). */
  rating?: RatingView;
  /** Стена меняет заставки сама по кругу (D-123). */
  carousel?: boolean;
};

function patch(old: TvState | null | undefined, input: TvControlInput, now: Date): TvState | null {
  if (!old) return old ?? null;
  const next: TvState = { ...old };
  if (input.mode === "employee" && input.employeeId) {
    next.mode = "employee";
    next.employee_id = input.employeeId;
    next.task_id = null;
    next.expires_at = new Date(now.getTime() + FOCUS_MS).toISOString();
  } else if (input.mode === "task" && input.taskId) {
    next.mode = "task";
    next.employee_id = null;
    next.task_id = input.taskId;
    next.expires_at = new Date(now.getTime() + FOCUS_MS).toISOString();
  } else if (input.mode === "ether") {
    next.mode = "ether";
    next.employee_id = null;
    next.task_id = null;
    next.expires_at = null;
  }
  if (input.board) {
    next.scene = "board";
    next.board_id = input.board;
    next.board_until = boardUntilFrom(now).toISOString();
    next.board_guest = false;
    // another board ends the spotlight (the trigger on tv_state does the same, D-121)
    if (old.board_id !== input.board) next.board_point = null;
  } else if (input.scene) {
    // another scene takes the board off the wall (same rule as tv_control)
    next.scene = input.scene;
    next.board_id = null;
    next.board_until = null;
    next.board_guest = false;
    next.board_point = null;
  }
  // a scene or a board picked by hand stops the round; the switch owns it (same rule as tv_control)
  if (input.carousel !== undefined) {
    next.carousel = input.carousel;
    if (input.carousel && next.scene === "board") {
      next.scene = "face";
      next.board_id = null;
      next.board_until = null;
      next.board_guest = false;
      next.board_point = null;
    }
  } else if (input.scene || input.board) {
    next.carousel = false;
  }
  if (input.rating) next.rating_view = input.rating;
  if (input.guest !== undefined) {
    next.guest = input.guest;
    // a hand on the switch owns guest mode: no timer after it (same rule as tv_control)
    next.guest_until = null;
    if (!input.guest) next.board_guest = false;
  }
  if (input.boardGuest !== undefined && input.guest !== false) next.board_guest = input.boardGuest;
  if (input.clock) next.clock_style = input.clock;
  if (input.calendar) next.calendar_view = input.calendar;
  if (input.wake !== undefined) next.awake_until = input.wake ? new Date(now.getTime() + WAKE_MS).toISOString() : null;
  return next;
}

export function useTvControl() {
  const queryClient = useQueryClient();

  return useMutation({
    // `always` перебивает глобальный `offlineFirst` (QueryProvider): без него команда
    // встала бы в очередь и переключила экран через полчаса, когда сеть вернулась, —
    // ровно то, чего пульт делать не должен (D-76 §3).
    networkMode: "always",
    mutationFn: async (input: TvControlInput): Promise<TvState> => {
      // браузер уже знает, что сети нет — не делаем вид, что пробуем
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error(OFFLINE);

      const supabase = createBrowserSupabase();
      const call = supabase.rpc("tv_control", {
        p_mode: input.mode,
        p_employee_id: input.employeeId,
        p_task_id: input.taskId,
        p_scene: input.scene,
        p_guest: input.guest,
        p_reload: input.reload ?? false,
        p_clock: input.clock,
        p_calendar: input.calendar,
        p_board: input.board,
        p_board_guest: input.boardGuest,
        p_wake: input.wake,
        p_rating: input.rating,
        p_carousel: input.carousel,
      });
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(OFFLINE)), TIMEOUT_MS),
      );
      const { data, error } = await Promise.race([call, timeout]);
      if (error) throw new Error(error.message);
      return data as unknown as TvState;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: tvKeys.state });
      const snapshot = queryClient.getQueryData<TvState | null>(tvKeys.state);
      queryClient.setQueryData<TvState | null>(tvKeys.state, (old) => patch(old, input, new Date()));
      return { snapshot };
    },
    onSuccess: (row) => {
      // RPC вернул итоговую строку — берём её, а не гадаем и не перечитываем
      queryClient.setQueryData<TvState | null>(tvKeys.state, row);
    },
    onError: (error, _input, context) => {
      if (context) queryClient.setQueryData(tvKeys.state, context.snapshot);
      // a declined or revoked order never goes up (D-45, D-123): say so, not «no network»
      toast(error instanceof Error && error.message.includes("bad_task") ? "Это дело на стену не встанет" : OFFLINE);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tvKeys.state });
    },
  });
}

/** Ведущий с пульта (D-121): подсветить пункт доски на стене, снять подсветку, сменить вид. */
export type TvBoardControlInput = {
  /** Подсветить этот пункт (верхнего уровня) доски, что сейчас на стене. */
  point?: string;
  /** Снять подсветку. */
  clearPoint?: boolean;
  /** «Список» или «Карта». */
  view?: BoardView;
};

const BOARD_ERRORS: Record<string, string> = {
  bad_point: "Этот пункт уже не на доске — обновил",
  no_wall: "Экран ещё не подключался",
  forbidden: "Доской на стене управляет только директор",
};

/**
 * Команда ведущего — тем же путём, что `useTvControl`: без очереди, с потолком ожидания,
 * строка стены двигается сразу и откатывается при ошибке. ◀ ▶ жмут подряд: ответы идут
 * по порядку (`scope`), и последнее нажатие остаётся последним.
 */
export function useTvBoardControl() {
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: "always",
    scope: { id: "tv-board-control" },
    mutationFn: async (input: TvBoardControlInput): Promise<TvState> => {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error(OFFLINE);

      const supabase = createBrowserSupabase();
      const call = supabase.rpc("tv_board_control", {
        p_point: input.point,
        p_clear_point: input.clearPoint ?? false,
        p_view: input.view,
      });
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(OFFLINE)), TIMEOUT_MS));
      const { data, error } = await Promise.race([call, timeout]);
      if (error) throw new Error(error.message);
      return data as unknown as TvState;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: tvKeys.state });
      const snapshot = queryClient.getQueryData<TvState | null>(tvKeys.state);
      queryClient.setQueryData<TvState | null>(tvKeys.state, (old) => {
        if (!old) return old ?? null;
        const next: TvState = { ...old };
        if (input.clearPoint) next.board_point = null;
        else if (input.point) next.board_point = input.point;
        if (input.view) next.board_view = input.view;
        return next;
      });
      return { snapshot };
    },
    onSuccess: (row) => {
      queryClient.setQueryData<TvState | null>(tvKeys.state, row);
    },
    onError: (error, _input, context) => {
      if (context) queryClient.setQueryData(tvKeys.state, context.snapshot);
      const code = Object.keys(BOARD_ERRORS).find((key) => error.message.includes(key));
      toast(code ? BOARD_ERRORS[code] : OFFLINE);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tvKeys.state });
    },
  });
}
