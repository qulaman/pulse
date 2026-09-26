"use client";

import { dehydrate, hydrate, type DehydratedState, type Query, type QueryClient } from "@tanstack/react-query";

import { BUILD } from "@/lib/version";

/**
 * The last data the phone saw, kept on the phone (D-127): the app starts with it instead of
 * skeletons and shows it without network, while fresh data is fetched over it. One snapshot
 * of the query cache in IndexedDB, tied to the build (a new build may shape its data
 * differently) and wiped at sign-in and sign-out (it is one person's view of the company).
 */

const DB_NAME = "pulse-offline";
const STORE = "kv";
const KEY = "queries";

/** Older than this, the snapshot says more about the past than about now. */
export const SNAPSHOT_MAX_AGE_MS = 7 * 86_400_000;
/** Saves are gathered: a burst of realtime patches is one write. */
const SAVE_DELAY_MS = 1_500;
/** Screens whose data is large or only for the moment — read again each time. */
const NOT_KEPT = new Set(["admin", "lab"]);

export type Snapshot = { build: string; savedAt: number; state: DehydratedState };

/** What goes into the snapshot: settled data of any screen but the heavy desk tools. */
export function shouldKeep(query: Pick<Query, "queryKey" | "state" | "meta">): boolean {
  if (query.state.status !== "success") return false;
  if (query.meta?.keep === false) return false;
  const head = query.queryKey[0];
  return !(typeof head === "string" && NOT_KEPT.has(head));
}

/** Whether a stored snapshot may be shown: this build's, and not too old. */
export function isUsable(snapshot: Snapshot | undefined | null, build: string, now: number): snapshot is Snapshot {
  if (!snapshot || snapshot.build !== build) return false;
  const age = now - snapshot.savedAt;
  return age >= 0 && age <= SNAPSHOT_MAX_AGE_MS;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, make: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = make(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function readSnapshot(): Promise<Snapshot | undefined> {
  return run("readonly", (store) => store.get(KEY) as IDBRequest<Snapshot | undefined>);
}

async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  await run("readwrite", (store) => store.put(snapshot, KEY));
}

/**
 * Forget what this phone kept: the data snapshot, and the screens the worker stored. At
 * sign-in and sign-out — the next person on this phone starts clean.
 */
export async function wipeOffline(): Promise<void> {
  try {
    await run("readwrite", (store) => store.delete(KEY));
  } catch {
    // no IndexedDB (a private window): nothing was kept
  }
  navigator.serviceWorker?.controller?.postMessage({ type: "offline-wipe" });
}

/**
 * Whether React still has parts of the page to hydrate: a Suspense boundary still holding the
 * server's HTML. Read from React's own tree — the one exact signal; neither the load event nor
 * an idle browser is one (a page's content went on hydrating ~200 ms after both, measured).
 * `null` when the tree cannot be read (another React) — the caller falls back to a timer.
 */
function stillHydrating(): boolean | null {
  const key = Object.keys(document).find((name) => name.startsWith("__reactContainer$"));
  if (!key) return null;
  type Fiber = { tag: number; child: Fiber | null; sibling: Fiber | null; memoizedState: { dehydrated?: unknown } | null };
  const container = (document as unknown as Record<string, { stateNode?: { current?: Fiber } }>)[key];
  const root = container?.stateNode?.current;
  if (!root) return null;
  const stack: Fiber[] = [root];
  for (let seen = 0; stack.length > 0; seen += 1) {
    if (seen > 50_000) return null;
    const fiber = stack.pop() as Fiber;
    // SuspenseComponent (13) with the server's markup still in place
    if (fiber.tag === 13 && fiber.memoizedState?.dehydrated) return true;
    if (fiber.child) stack.push(fiber.child);
    if (fiber.sibling) stack.push(fiber.sibling);
  }
  return false;
}

/**
 * The page has hydrated. Data put into the cache before that made a component draw what the
 * server's HTML did not have (React #418) — even data taken for a component already mounted,
 * when another one still hydrating reads the same query. So the kept data waits for this.
 */
function afterHydration(): Promise<void> {
  const start = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      const pending = stillHydrating();
      const waited = performance.now() - start;
      if (pending === false || waited > 6_000 || (pending === null && waited > 2_500 && document.readyState === "complete")) resolve();
      else setTimeout(check, 100);
    };
    check();
  });
}

/**
 * Put the kept data into the cache once the page has hydrated. `hydrate` never overwrites data
 * fetched meanwhile; screens opened later find their data at once.
 */
export async function restoreQueries(client: QueryClient): Promise<void> {
  try {
    const [snapshot] = await Promise.all([readSnapshot(), afterHydration()]);
    if (isUsable(snapshot, BUILD.id, Date.now())) hydrate(client, snapshot.state);
  } catch {
    // no IndexedDB (a private window): the screens simply load
  }
}

/** Keep the cache on the phone as it changes; returns the stop. */
export function keepQueries(client: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    const state = dehydrate(client, { shouldDehydrateQuery: shouldKeep, shouldDehydrateMutation: () => false });
    // a query whose data the browser cannot clone is simply not kept this time
    void writeSnapshot({ build: BUILD.id, savedAt: Date.now(), state }).catch(() => {});
  };
  const later = () => {
    if (!timer) timer = setTimeout(save, SAVE_DELAY_MS);
  };
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "success") later();
    else if (event.type === "removed") later();
  });
  // a phone put away mid-way still keeps the last minute
  const flush = () => {
    if (document.visibilityState === "hidden" && timer) {
      clearTimeout(timer);
      save();
    }
  };
  document.addEventListener("visibilitychange", flush);
  return () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", flush);
    if (timer) clearTimeout(timer);
  };
}

/** The moment the data on screen was last fetched — for «Нет связи · данные на 14:32». */
export function latestFetch(client: QueryClient): number | null {
  let latest = 0;
  for (const query of client.getQueryCache().getAll()) latest = Math.max(latest, query.state.dataUpdatedAt);
  return latest > 0 ? latest : null;
}
