/**
 * The daily report contract (D-152, tasks/021): the shapes the database functions return as
 * jsonb and the screens read. One file for both sides — a change here is a change of contract.
 * Days are Asia/Aqtobe calendar days as "YYYY-MM-DD"; instants are ISO timestamptz strings.
 */

export type DailyReportStatus = "submitted" | "missed";

/** A task the person handed over or got closed on that day — written into the report by itself. */
export type DailyReportTask = {
  id: string;
  title: string;
  /** pending_review — «на приёмке», done — «принята». */
  status: "pending_review" | "done";
  /** Hand-over time (`tasks.completed_at`). */
  completed_at: string | null;
  /** The director's «Принято» (`tasks.closed_at`), only for done. */
  closed_at: string | null;
  /** Handed over by the deadline; null — the task had none. */
  on_time: boolean | null;
};

export type DailyReport = {
  id: string;
  user_id: string;
  report_date: string;
  status: DailyReportStatus;
  arrived_at: string | null;
  left_at: string | null;
  /** «Чем занимался» — the person's own words. */
  summary: string | null;
  /** Snapshot taken at the last submit; [] on a missed day. */
  tasks: DailyReportTask[];
  submitted_at: string | null;
  updated_at: string;
  /**
   * Points this report brought: +reward, −penalty or 0 (points off, a day off); net of a refund by
   * «Оспорить» and of a minus given back because no report came before it (D-155 §1).
   */
  points: number;
  /**
   * The director excused a missed day (D-183, `excuse_daily_report`): when and why; the minus is
   * given back by an appended transaction, so `points` is already net of it. null — not excused.
   */
  excused_at: string | null;
  excused_reason: string | null;
};

/** The employee's screen for one day — `my_daily_report(p_date)`. */
export type MyDailyReportDay = {
  date: string;
  /** Only today's report can be submitted or edited. */
  today: boolean;
  /** A working day by `settings.daily_report.workdays` and not a holiday; points only on these. */
  workday: boolean;
  /** The day is in `settings.daily_report.holidays` (D-155 §7): no report is due, no points. */
  holiday: boolean;
  /** `settings.daily_report.enabled` — off: the screen says so and the form is hidden. */
  enabled: boolean;
  report: DailyReport | null;
  /** Live: what the day holds now (the form shows these before the first submit). */
  tasks: DailyReportTask[];
  /** Prefill: arrival — the last report's time of day or `work_start`; leaving — now. */
  suggest: { arrived_at: string; left_at: string };
  /**
   * `penalty` — what a miss costs this person: 0 until they have handed in a report before this
   * day (D-155 §1), else the company's rule.
   */
  points: { enabled: boolean; reward: number; penalty: number };
};

/** POST body of the submit (both the RPC args and the outbox payload). */
export type SubmitDailyReportInput = {
  arrived_at: string;
  left_at: string;
  summary: string;
  client_request_id: string;
};

/** `submit_daily_report(...)`: the stored report; `points_awarded` is 0 on an edit or a replay. */
export type SubmitDailyReportResult = {
  report: DailyReport;
  points_awarded: number;
};

/** One row of `my_daily_report_history(p_limit)`: newest first, submitted and missed days. */
export type DailyReportHistoryItem = DailyReport;

/**
 * Where a person stands on a day, for the director:
 * submitted — handed in; missed — a past required day without a report (the morning tick writes the fine,
 * the state is the same before it too); pending — today, not handed in yet;
 * a day the morning tick has closed (`settings.daily_report.checked_on`) and left without a row —
 * away (it skipped the person: leave or sick); days it has not closed yet use today's availability;
 * away — on leave or sick; off — not a workday / not working here yet / the module is off.
 */
export type TeamDayState = "submitted" | "missed" | "pending" | "away" | "off";

export type TeamDayActivity = {
  /** Tasks the person took («Принял») that day. */
  accepted: number;
  /** Tasks handed over («Выполнено») that day. */
  handed_over: number;
  /** Their tasks the director accepted («Принято») that day. */
  closed: number;
  /** Messages they wrote in task threads that day. */
  messages: number;
};

export type TeamDayRow = {
  user_id: string;
  full_name: string;
  position: string | null;
  avatar_url: string | null;
  availability: "active" | "vacation" | "sick";
  state: TeamDayState;
  report: DailyReport | null;
  /** Live, same rule as the report's tasks. */
  tasks: DailyReportTask[];
  activity: TeamDayActivity;
  /** left − arrived, hours with one decimal; null without a report. */
  hours: number | null;
  /**
   * The latest «Сдайте отчёт» push of the day (D-183): the director's «Напомнить» or the sweep's own;
   * its receipt as the delivery queue keeps it. null — nobody was reminded that day.
   */
  reminded: DailyReportReminder | null;
};

export type DailyReportReminder = {
  /** Queued at. */
  at: string;
  by: "director" | "auto";
  sent_at: string | null;
  seen_at: string | null;
};

/** The director's day — `team_daily_report_day(p_date)`; rows: submitted, pending, missed, away, off; by name inside. */
export type TeamDay = {
  date: string;
  today: boolean;
  workday: boolean;
  rows: TeamDayRow[];
  totals: {
    team: number;
    submitted: number;
    missed: number;
    pending: number;
    away: number;
    /** Missed days the director excused (D-183); `missed` leaves them out. */
    excused: number;
    handed_over: number;
    closed: number;
  };
};

export type TeamPeriodRow = {
  user_id: string;
  full_name: string;
  position: string | null;
  avatar_url: string | null;
  /** Days the report was due: workdays in the period from `started_on`, after the person joined, not after today. */
  workdays: number;
  /** Reports handed in on the days they were due (D-183: a report on a day off is not counted). */
  submitted: number;
  /** Due days without a report, the excused ones left out. */
  missed: number;
  /** Missed days the director excused (D-183). */
  excused: number;
  /** submitted / (submitted + missed), 0..1; null when nothing was due yet. */
  submit_rate: number | null;
  /** Average local time of day, "HH:MM"; null without reports. */
  avg_arrived: string | null;
  avg_left: string | null;
  avg_hours: number | null;
  hours_total: number;
  handed_over: number;
  closed: number;
  /** Of the handed-over tasks with a deadline: by it / after it. */
  on_time: number;
  late: number;
  /** Sum of the report rules' points in the period (+ for submitted, − for missed). */
  points: number;
};

/** The director's period — `team_daily_report_period(p_from, p_to)`, both days inclusive, at most 92 days. */
export type TeamPeriod = {
  from: string;
  to: string;
  rows: TeamPeriodRow[];
  /** One entry per calendar day of the period, oldest first — the team's line of the period. */
  days: { date: string; workday: boolean; submitted: number; missed: number; excused: number; handed_over: number; closed: number }[];
  totals: {
    team: number;
    submitted: number;
    missed: number;
    excused: number;
    submit_rate: number | null;
    handed_over: number;
    closed: number;
    hours_total: number;
  };
};

/** RPC names of the module — the only way the screens talk to the database for it. */
export const DAILY_REPORT_RPC = {
  my: "my_daily_report",
  submit: "submit_daily_report",
  history: "my_daily_report_history",
  teamDay: "team_daily_report_day",
  teamPeriod: "team_daily_report_period",
  /** One person's reports for the director, newest first (D-183). */
  person: "person_daily_reports",
  /** «Уважительная причина» on a missed day (D-183). */
  excuse: "excuse_daily_report",
  /** «Напомнить» — called through POST /api/reports/remind, which also kicks the delivery queue. */
  remind: "remind_daily_report",
} as const;

/** One row of `person_daily_reports(p_user_id, p_from, p_to)`: the report and the dispute on its minus. */
export type PersonDailyReport = DailyReport & {
  /** The person's dispute of this report's minus; null — none. */
  dispute: { id: string; transaction_id: string; text: string; created_at: string; resolved: boolean } | null;
};

/** `excuse_daily_report(...)`: the stored report and the points given back (0 — there was no minus). */
export type ExcuseDailyReportResult = { report: DailyReport; points_returned: number };

/** POST /api/reports/remind → `remind_daily_report(p_user_ids, ...)`. */
export type RemindDailyReportResult = {
  /** Who got a push queued now. */
  reminded: string[];
  /**
   * Who did not, and why: already reminded today, the report is in, away, not due today, or `late` —
   * the delivery window is shut till tomorrow, a push then would be about a day that is over.
   */
  skipped: { user_id: string; reason: "already" | "submitted" | "away" | "not_due" | "late" }[];
  /** Before the window opens (08:00) the pushes wait for it: when they leave; null — now. */
  deliver_after?: string | null;
};

/** Errors the RPCs raise (`raise exception '<code>'`), mapped to Russian words by the screens. */
export type DailyReportError =
  | "daily_report_disabled"
  | "not_team_member"
  | "bad_times"
  | "summary_required"
  | "summary_too_long"
  | "bad_period"
  | "not_missed"
  | "already_excused"
  | "disputed"
  | "reason_required";
