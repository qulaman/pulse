import { MODEL_PRICES, STT_PRICE_PER_MINUTE } from "@/lib/ai/pricing";

/**
 * What one client instance costs to run, by company size — the lab's «Себестоимость» tab.
 * A model, not a measurement: the day is an assumed "active use" day, row and file sizes
 * come from the dev database, vendor prices were checked on PRICES_CHECKED. One client is
 * its own Supabase project and its own deployment (V-02), so the per-client figures are
 * that project's compute plus usage; the plan subscriptions are shared by the whole fleet.
 * Money in USD.
 */

export const PRICES_CHECKED = "23.09.2026";

export const VERCEL = {
  seat: 20,
  credit: 20,
  cpuHour: 0.128,
  memGbHour: 0.0106,
  perMillionCalls: 0.6,
  perMillionEdge: 2,
  perGb: 0.15,
  includedCalls: 1_000_000,
} as const;

export const SUPABASE = {
  org: 25,
  computeCredit: 10,
  /** The dev project of the fleet: one Micro, paid by the compute credit. */
  devCompute: 10,
  egressGb: 0.09,
  storageGb: 0.0213,
  realtimePerMillion: 2.5,
  includedDiskGb: 8,
  includedEgressGb: 250,
  includedStorageGb: 100,
  includedRealtime: 5_000_000,
  includedConnections: 500,
} as const;

/** Paid every month whatever the fleet size: the Vercel seat and the Supabase organisation. */
export const PLATFORM_MONTHLY = VERCEL.seat + SUPABASE.org;

/** The client's database server, sized with room for the morning peak and Realtime. */
const COMPUTE = [
  { upTo: 50, name: "Micro", usd: 10 },
  { upTo: 200, name: "Small", usd: 15 },
  { upTo: 500, name: "Medium", usd: 60 },
  { upTo: 1000, name: "Large", usd: 110 },
  { upTo: Infinity, name: "XL", usd: 210 },
] as const;

const PARSER_MODEL = "claude-haiku-4-5";
const STT_PROVIDER = "openai-4o";
/** Haiku 4.5 context window: the roster in the prompt must fit under it. */
export const PARSER_CONTEXT = 200_000;

/** The "active use" day. Everything scales with the headcount unless said otherwise. */
export const ACTIVITY = {
  tasksPerEmployee: 1.2,
  entitiesPerCommand: 1.6,
  voiceShare: 0.8,
  commandAudioSec: 15,
  /** 48 kbit/s recorder (lib/voice/recorder.ts). */
  audioKBps: 6,
  messagesPerTask: 3,
  deliveriesPerTask: 4,
  updatesPerTask: 5,
  readsPerTask: 2,
  tvEventsPerTask: 2,
  photosPerEmployee: 0.3,
  /** ≤1600 px JPEG (lib/files/photo.ts). */
  photoKB: 350,
  threadVoicePerEmployee: 0.3,
  threadVoiceKB: 60,
  opensPerEmployee: 15,
  openKB: 30,
  navigationsPerEmployee: 20,
  navigationKB: 25,
  errandsPerEmployee: 0.2,
  eventsPerEmployee: 0.1,
  visitsPerEmployee: 0.1,
  announcementsPerDay: 2,
  notesPerDay: 10,
  voiceNotesPerDay: 5,
  voiceNoteSec: 20,
  /** Parser prompt without the roster, and what each active person adds (count_tokens). */
  promptBaseTokens: 7000,
  rosterTokensPerEmployee: 100,
  outputTokens: 150,
  freshInputTokens: 300,
  /** Retries and the odd escalation. */
  retryFactor: 1.1,
  /** Commands arrive over a 10-hour day. */
  workMinutes: 600,
  /** Share of the staff holding a live socket at the peak. */
  peakOnline: 0.6,
} as const;

/** Bytes on disk per row: tuple + header + indexes + update bloat, from dev pg_column_size. */
const ROW_BYTES = {
  tasks: 700,
  task_messages: 400,
  notification_deliveries: 700,
  ai_logs: 1000,
  ingest_batches: 700,
  inbox_items: 850,
  tv_events: 400,
  point_transactions: 300,
  task_reads: 200,
  announcements: 600,
  announcement_acks: 200,
  errands: 400,
  events: 600,
  event_participants: 200,
  visits: 400,
  notes: 500,
} as const;

/** With the trimmed roster the parser sees at most this many people (the command's department). */
export const ROSTER_CAP = 100;

export type CacheTtl = "5m" | "1h";

export interface CostOptions {
  cacheTtl: CacheTtl;
  trimRoster: boolean;
}

export type CostKey = "compute" | "supabase" | "vercel" | "ai";

export interface CostLine {
  key: CostKey;
  usd: number;
}

export interface Quota {
  key: string;
  used: number;
  included: number;
  /** Per client project, or one allowance the whole fleet shares. */
  scope: "project" | "fleet";
}

export interface CostEstimate {
  headcount: number;
  tvs: number;
  compute: { name: string; usd: number };
  day: {
    tasks: number;
    commands: number;
    rows: number;
    dbMb: number;
    filesMb: number;
    realtime: number;
    egressMb: number;
    calls: number;
    peakRps: number;
  };
  parser: { promptTokens: number; cacheHit: number; perParse: number };
  /** One more client in a running fleet, per month. */
  lines: CostLine[];
  month: number;
  perEmployee: number;
  year: { total: number; dbGb: number; filesGb: number };
  /** The bill when this is the only client: plans, its server, the dev project, AI. */
  alone: { platform: number; supabase: number; ai: number; total: number };
  quotas: Quota[];
}

export function computeFor(headcount: number): { name: string; usd: number } {
  const tier = COMPUTE.find((c) => headcount <= c.upTo) ?? COMPUTE[COMPUTE.length - 1];
  return { name: tier.name, usd: tier.usd };
}

function tvsFor(headcount: number): number {
  return headcount <= 50 ? 1 : headcount <= 200 ? 2 : 4;
}

export function estimateCost(headcount: number, options: CostOptions): CostEstimate {
  const n = Math.max(1, Math.round(headcount));
  const a = ACTIVITY;
  const tvs = tvsFor(n);

  const tasks = a.tasksPerEmployee * n;
  const commands = tasks / a.entitiesPerCommand;
  const voiceCommands = commands * a.voiceShare;

  // AI: speech for voice commands and voice notes, Haiku for every command
  const sttMinutes = (voiceCommands * a.commandAudioSec + a.voiceNotesPerDay * a.voiceNoteSec) / 60;
  const stt = sttMinutes * STT_PRICE_PER_MINUTE[STT_PROVIDER] * a.retryFactor;
  const haiku = MODEL_PRICES[PARSER_MODEL];
  const rostered = options.trimRoster ? Math.min(n, ROSTER_CAP) : n;
  const promptTokens = a.promptBaseTokens + a.rosterTokensPerEmployee * rostered;
  // a command finds the prefix cached when the previous one came within the TTL (Poisson)
  const ttlMinutes = options.cacheTtl === "1h" ? 60 : 5;
  const cacheHit = 1 - Math.exp(-(commands / a.workMinutes) * ttlMinutes);
  // a 1-hour cache write costs twice the input price, a 5-minute one 1.25x
  const write = options.cacheTtl === "1h" ? haiku.input * 2 : haiku.cacheWrite;
  const perParse =
    (a.freshInputTokens * haiku.input +
      a.outputTokens * haiku.output +
      promptTokens * (cacheHit * haiku.cacheRead + (1 - cacheHit) * write)) /
    1e6;
  const parse = commands * perParse * a.retryFactor;

  // database rows and their bytes
  const errands = a.errandsPerEmployee * n;
  const events = a.eventsPerEmployee * n;
  const visits = a.visitsPerEmployee * n;
  const rows: Record<keyof typeof ROW_BYTES, number> = {
    tasks,
    task_messages: tasks * a.messagesPerTask,
    notification_deliveries: tasks * a.deliveriesPerTask + a.announcementsPerDay * n + errands * 2,
    ai_logs: voiceCommands + commands + a.voiceNotesPerDay,
    ingest_batches: commands,
    inbox_items: commands * a.entitiesPerCommand,
    tv_events: tasks * a.tvEventsPerTask,
    point_transactions: tasks,
    task_reads: tasks * a.readsPerTask,
    announcements: a.announcementsPerDay,
    announcement_acks: a.announcementsPerDay * n,
    errands,
    events,
    event_participants: events * 3,
    visits,
    notes: a.notesPerDay,
  };
  let rowCount = 0;
  let dbBytes = 0;
  for (const key of Object.keys(rows) as (keyof typeof ROW_BYTES)[]) {
    rowCount += rows[key];
    dbBytes += rows[key] * ROW_BYTES[key];
  }
  const dbMb = dbBytes / 1_048_576;

  // files: voice commands and notes, photos, voice replies in threads
  const filesKB =
    voiceCommands * a.commandAudioSec * a.audioKBps +
    a.voiceNotesPerDay * a.voiceNoteSec * a.audioKBps +
    a.photosPerEmployee * n * a.photoKB +
    a.threadVoicePerEmployee * n * a.threadVoiceKB;
  const filesMb = filesKB / 1024;

  // postgres_changes, counted once per receiving client: a task change reaches ~5 channels
  const realtime =
    tasks * ((1 + a.updatesPerTask) * 5 + a.messagesPerTask * 2 + a.deliveriesPerTask * 4) +
    a.announcementsPerDay * n * 2 +
    errands * 6 +
    events * 4 +
    visits * 4;

  // egress: snapshots on every app open, the heavy boards, realtime payloads, file views, TV polling
  const tvMb = (tvs * 540 * 12 * 3) / 1024;
  const egressMb = (n * a.opensPerEmployee * a.openKB + 3 * 60 * 150) / 1024 + realtime / 1024 + (filesKB * 1.8) / 1024 + tvMb;

  // Vercel: the minute cron, dynamic pages, API routes, the voice pipeline
  const cron = 1440;
  const pages = n * a.navigationsPerEmployee + 3 * 60;
  const api = tasks * 4 + n * a.opensPerEmployee * 0.5 + commands * 4 + errands * 3 + visits * 2;
  const calls = cron + pages + api;
  const cpuSec = cron * 0.04 + pages * 0.06 + api * 0.03 + commands * 2 * 0.05;
  const wallSec = cron * 1.2 + pages * 0.35 + api * 0.3 + commands * 2 * 3;
  const memGbHours = (wallSec * 2) / 3600;
  const edge = calls + n * a.opensPerEmployee * 6;
  const vercelGb = (n * (a.opensPerEmployee * a.openKB + a.navigationsPerEmployee * a.navigationKB) + (n * 1024) / 7) / 1_048_576;
  const vercelDay =
    (cpuSec / 3600) * VERCEL.cpuHour +
    memGbHours * VERCEL.memGbHour +
    (calls / 1e6) * VERCEL.perMillionCalls +
    (edge / 1e6) * VERCEL.perMillionEdge +
    vercelGb * VERCEL.perGb;

  const compute = computeFor(n);
  const filesGbMonth = (filesMb * 30) / 1024;
  // usage priced as if the fleet had already spent the shared allowances; files at their
  // average size over the first year
  const supabase =
    ((egressMb * 30) / 1024) * SUPABASE.egressGb +
    ((realtime * 30) / 1e6) * SUPABASE.realtimePerMillion +
    filesGbMonth * 6.5 * SUPABASE.storageGb;
  const vercel = vercelDay * 30;
  const ai = (stt + parse) * 30;
  const lines: CostLine[] = [
    { key: "compute", usd: compute.usd },
    { key: "supabase", usd: supabase },
    { key: "vercel", usd: vercel },
    { key: "ai", usd: ai },
  ];
  const month = lines.reduce((sum, line) => sum + line.usd, 0);

  // alone: the plans, this server and the dev one minus the credit; usage fits the allowances
  const aloneSupabase = SUPABASE.org + compute.usd + SUPABASE.devCompute - SUPABASE.computeCredit;
  const aloneVercel = Math.max(VERCEL.seat, VERCEL.seat - VERCEL.credit + vercel);

  const dbGbYear = (dbMb * 365) / 1024;
  const filesGbYear = (filesMb * 365) / 1024;
  const peakConnections = Math.round(a.peakOnline * n) + tvs + 3;

  return {
    headcount: n,
    tvs,
    compute,
    day: {
      tasks,
      commands,
      rows: rowCount,
      dbMb,
      filesMb,
      realtime,
      egressMb,
      calls,
      // an 8-hour day with the peak at six times the average
      peakRps: ((pages + api) / (8 * 3600)) * 6,
    },
    parser: { promptTokens, cacheHit, perParse },
    lines,
    month,
    perEmployee: month / n,
    year: { total: month * 12, dbGb: dbGbYear, filesGb: filesGbYear },
    alone: { platform: aloneVercel, supabase: aloneSupabase, ai, total: aloneVercel + aloneSupabase + ai },
    quotas: [
      { key: "prompt", used: promptTokens, included: PARSER_CONTEXT, scope: "project" },
      { key: "connections", used: peakConnections, included: SUPABASE.includedConnections, scope: "project" },
      { key: "disk", used: dbGbYear, included: SUPABASE.includedDiskGb, scope: "project" },
      { key: "calls", used: calls * 30, included: VERCEL.includedCalls, scope: "fleet" },
      { key: "credit", used: vercel, included: VERCEL.credit, scope: "fleet" },
      { key: "egress", used: (egressMb * 30) / 1024, included: SUPABASE.includedEgressGb, scope: "fleet" },
      { key: "realtime", used: realtime * 30, included: SUPABASE.includedRealtime, scope: "fleet" },
      { key: "files", used: filesGbYear, included: SUPABASE.includedStorageGb, scope: "fleet" },
    ],
  };
}

/** Per client when `clients` share the plan subscriptions. */
export function perClientInFleet(estimate: CostEstimate, clients: number): number {
  return estimate.month + PLATFORM_MONTHLY / Math.max(1, clients);
}
