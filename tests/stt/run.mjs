#!/usr/bin/env node
/**
 * STT gate runner (docs/STT_GATE.md). Zero dependencies, Node >= 18.
 *
 * Full gate run over recorded fixtures:
 *   node tests/stt/run.mjs [--providers gpt4o,gpt4o-noroster,whisper,deepgram,scribe]
 *                          [--mic phone|headset|all] [--lang ru|none] [--fixtures tests/stt/fixtures]
 *
 * Smoke test with a single file (record a voice memo, drop it anywhere):
 *   node tests/stt/run.mjs smoke path/to/audio.m4a "эталонный текст фразы"
 *
 * Env: OPENAI_API_KEY (gpt4o/whisper), DEEPGRAM_API_KEY (nova-3), ELEVENLABS_API_KEY (scribe).
 * Fixture naming: NNN_{A-F}_{phone|headset}.m4a  (see tests/stt/RECORDING.md)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROSTER = JSON.parse(readFileSync(join(HERE, "roster.json"), "utf8"));
const CORPUS = readFileSync(join(HERE, "corpus.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));

/* ---------- text normalization & matching (deterministic, no LLM) ---------- */

// Russian + Kazakh case endings, longest first (STT_GATE.md §4).
const ENDINGS = ["ға","ге","қа","ке","ды","ді","ты","ті","ом","ой","ей","у","е","а","ы","ю","я"];

// Numeral words → digits so "в десять" == "в 10" in WER (semantic, not orthographic, comparison).
const NUMWORDS = { "ноль":"0","один":"1","одна":"1","два":"2","две":"2","три":"3","четыре":"4","пять":"5",
  "шесть":"6","семь":"7","восемь":"8","девять":"9","десять":"10","одиннадцать":"11","двенадцать":"12",
  "пятнадцать":"15","двадцать":"20","тридцать":"30","сорок":"40","пятьдесят":"50","сто":"100" };
const normalize = s => s.toLowerCase().replace(/ё/g, "е")
  .replace(/[^a-zа-яәғқңөұүһі0-9\s-]/gi, " ").replace(/\s+/g, " ").trim()
  .split(" ").map(w => NUMWORDS[w] ?? w).join(" ");

const ENDINGS_SORTED = [...ENDINGS].sort((a, b) => b.length - a.length);
// Recursive: "Алияға" → "алия" → "али" must meet transcript's "алия" → "али".
function stem(word) {
  let s = word, again = true;
  while (again && s.length > 3) {
    again = false;
    for (const e of ENDINGS_SORTED) {
      if (s.endsWith(e) && s.length - e.length >= 3) { s = s.slice(0, -e.length); again = true; break; }
    }
  }
  return s;
}
const stems = text => normalize(text).split(" ").filter(Boolean).map(stem);

// A mention surface is found if every token matches (stems for words, exact for initials).
function surfaceFound(surface, tStems, tTokens) {
  return normalize(surface).split(" ").filter(Boolean).every(tok =>
    tok.length <= 2 ? tTokens.includes(tok) : tStems.includes(stem(tok)));
}

// User "distinctly present": a surface unique to this user is found.
function userSurfaces(u) { return [u.full_name, ...u.aliases]; }
function distinctlyPresent(u, tStems, tTokens) {
  const firstNameStem = stem(normalize(u.full_name).split(" ")[0]);
  const shared = ROSTER.users.some(o => o.id !== u.id &&
    stem(normalize(o.full_name).split(" ")[0]) === firstNameStem);
  if (!shared && tStems.includes(firstNameStem)) return true;
  return userSurfaces(u).some(s => normalize(s).split(" ").length > 1 && surfaceFound(s, tStems, tTokens));
}

function scoreFile(entry, transcript) {
  const tTokens = normalize(transcript).split(" ").filter(Boolean);
  const tStems = tTokens.map(stem);
  let nameTotal = 0, nameFound = 0, aTotal = 0, aCorrect = 0, aWrong = 0;
  for (const m of entry.names) {
    nameTotal++;
    if (surfaceFound(m.surface, tStems, tTokens)) nameFound++;
    if (m.ambiguous) continue; // two-Erlan style ambiguity is a parser concern, not STT
    aTotal++;
    const expected = ROSTER.users.find(u => u.id === m.user_id);
    if (distinctlyPresent(expected, tStems, tTokens)) { aCorrect++; continue; }
    const expectedIds = new Set(entry.names.map(n => n.user_id));
    const intruder = ROSTER.users.some(u => !expectedIds.has(u.id) && distinctlyPresent(u, tStems, tTokens));
    if (intruder) aWrong++; // else: miss
  }
  return { nameTotal, nameFound, aTotal, aCorrect, aWrong, wer: wer(entry.text, transcript) };
}

function wer(ref, hyp) {
  const r = normalize(ref).split(" ").filter(Boolean), h = normalize(hyp).split(" ").filter(Boolean);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 0; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++)
    d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (r[i-1] === h[j-1] ? 0 : 1));
  return r.length ? d[r.length][h.length] / r.length : 0;
}

/* ---------- providers ---------- */

// Mirrors lib/ai/stt.ts hintsToPrompt (D-53): a sentence, never a list — gpt-4o-transcribe
// continues a list instead of transcribing short or noisy audio. Aliases ("Ерлан Б", "Ерлан Д")
// are included: spoken initials are acoustically fragile — hint the valid combinations.
const rosterPrompt = () => {
  const full = ROSTER.users.map(u => u.full_name);
  const short = [...new Set(ROSTER.users.flatMap(u => u.aliases.filter(a => a !== u.full_name)))];
  let p = "Директор диктует поручения сотрудникам.";
  if (full.length) p += " В компании работают " + full.join(", ") + (short.length ? "; коротко их зовут " + short.join(", ") + "." : ".");
  if (ROSTER.counterparties.length) p += " Контрагенты и объекты: " + ROSTER.counterparties.join(", ") + ".";
  return p;
};

const PRICE_PER_MIN = { gpt4o: 0.006, "gpt4o-noroster": 0.006, whisper: 0.006, deepgram: 0.0043, scribe: 0.0067 }; // estimates

async function sttOpenAI(model, buf, filename, { lang, prompt }) {
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "audio/mp4" }), filename);
  fd.append("model", model);
  if (lang) fd.append("language", lang);
  if (prompt) fd.append("prompt", prompt);
  if (model === "whisper-1") fd.append("response_format", "verbose_json");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: fd });
  if (!r.ok) throw new Error(`${model} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return { text: j.text ?? "", durationS: j.duration ?? null };
}

async function sttDeepgram(buf, { lang }) {
  const kw = ROSTER.users.flatMap(u => userSurfaces(u)).concat(ROSTER.counterparties)
    .map(k => "keywords=" + encodeURIComponent(k + ":2")).join("&");
  const url = `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true${lang ? `&language=${lang}` : ""}&${kw}`;
  const r = await fetch(url, { method: "POST",
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": "audio/mp4" }, body: buf });
  if (!r.ok) throw new Error(`deepgram HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return { text: j.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "", durationS: j.metadata?.duration ?? null };
}

async function sttScribe(buf, filename, { lang }) {
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "audio/mp4" }), filename);
  fd.append("model_id", "scribe_v2");
  if (lang) fd.append("language_code", lang);
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY }, body: fd });
  if (!r.ok) throw new Error(`scribe HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return { text: j.text ?? "", durationS: null };
}

const CONFIGS = {
  "gpt4o":          { need: "OPENAI_API_KEY",     run: (b, f, o) => sttOpenAI("gpt-4o-transcribe", b, f, { ...o, prompt: rosterPrompt() }) },
  "gpt4o-noroster": { need: "OPENAI_API_KEY",     run: (b, f, o) => sttOpenAI("gpt-4o-transcribe", b, f, { ...o, prompt: null }) },
  "whisper":        { need: "OPENAI_API_KEY",     run: (b, f, o) => sttOpenAI("whisper-1", b, f, { ...o, prompt: rosterPrompt() }) },
  "deepgram":       { need: "DEEPGRAM_API_KEY",   run: (b, _f, o) => sttDeepgram(b, o) },
  "scribe":         { need: "ELEVENLABS_API_KEY", run: (b, f, o) => sttScribe(b, f, o) },
};

/* ---------- aggregation & report ---------- */

function aggregate(rows) {
  const sum = k => rows.reduce((a, r) => a + r[k], 0);
  const nameTotal = sum("nameTotal"), aTotal = sum("aTotal");
  return {
    files: rows.length,
    nameRecall: nameTotal ? sum("nameFound") / nameTotal : null,
    assigneeAcc: aTotal ? sum("aCorrect") / aTotal : null,
    wrongRate: aTotal ? sum("aWrong") / aTotal : null,
    wer: rows.length ? rows.reduce((a, r) => a + r.wer, 0) / rows.length : null,
    p50LatencyMs: rows.length ? [...rows].map(r => r.latencyMs).sort((a, b) => a - b)[Math.floor(rows.length / 2)] : null,
    costUsd: rows.reduce((a, r) => a + r.costUsd, 0),
  };
}
const pct = v => v == null ? "  —  " : (v * 100).toFixed(1).padStart(5) + "%";
const gate = a => a.nameRecall >= 0.95 && a.assigneeAcc >= 0.90 && a.wrongRate <= 0.02 ? "✅" : "✖";

/* ---------- modes ---------- */

async function smoke(file, refText) {
  const name = Object.keys(CONFIGS).find(n => process.env[CONFIGS[n].need] && n !== "gpt4o-noroster");
  if (!name) { console.error("Нет ни одного API-ключа (OPENAI_API_KEY / DEEPGRAM_API_KEY / ELEVENLABS_API_KEY)."); process.exit(1); }
  const buf = readFileSync(file);
  console.log(`Смоук через "${name}", файл ${basename(file)} (${(buf.length / 1024).toFixed(0)} КБ)…`);
  const t0 = Date.now();
  const { text } = await CONFIGS[name].run(buf, basename(file), { lang: "ru" });
  console.log(`\nТранскрипт (${Date.now() - t0} мс):\n  ${text}\n`);
  const tTokens = normalize(text).split(" ").filter(Boolean), tStems = tTokens.map(stem);
  const found = ROSTER.users.filter(u => distinctlyPresent(u, tStems, tTokens)).map(u => u.full_name);
  console.log("Однозначно распознанные сотрудники из ростера:", found.length ? found.join(", ") : "(никого)");
  if (refText) {
    const s = scoreFile({ text: refText, names: [] }, text);
    console.log(`WER к эталону: ${(s.wer * 100).toFixed(1)}%`);
  }
}

async function fullRun(args) {
  const fixturesDir = args.fixtures ?? join(HERE, "fixtures");
  const micFilter = args.mic ?? "phone";
  const lang = (args.lang ?? "ru") === "none" ? null : (args.lang ?? "ru");
  const wanted = (args.providers ?? "gpt4o,gpt4o-noroster,whisper,deepgram,scribe").split(",");
  const configs = wanted.filter(n => CONFIGS[n] && process.env[CONFIGS[n].need]);
  const skipped = wanted.filter(n => CONFIGS[n] && !process.env[CONFIGS[n].need]);
  if (skipped.length) console.log(`Пропущены (нет ключа): ${skipped.join(", ")}`);
  if (!configs.length) { console.error("Ни одного доступного провайдера — задайте API-ключи."); process.exit(1); }
  if (!existsSync(fixturesDir)) { console.error(`Нет каталога фикстур: ${fixturesDir}. Запишите аудио по tests/stt/RECORDING.md.`); process.exit(1); }

  const files = readdirSync(fixturesDir).filter(f => /^\d{3}_[A-F]_(phone|headset)\.(m4a|mp3|wav|ogg|webm)$/i.test(f))
    .filter(f => micFilter === "all" || f.includes(`_${micFilter}.`));
  if (!files.length) { console.error(`В ${fixturesDir} нет файлов вида NNN_A_${micFilter}.m4a`); process.exit(1); }
  console.log(`Файлов: ${files.length}, конфигурации: ${configs.join(", ")}, язык: ${lang ?? "(без хинта)"}\n`);

  const manifest = [], results = {};
  for (const cfg of configs) {
    const rows = [];
    for (const f of files) {
      const id = f.slice(0, 3);
      const entry = CORPUS.find(c => c.id === id);
      if (!entry) { console.warn(`  ? ${f}: нет фразы ${id} в corpus.jsonl — пропуск`); continue; }
      const buf = readFileSync(join(fixturesDir, f));
      const t0 = Date.now();
      try {
        const { text, durationS } = await CONFIGS[cfg].run(buf, f, { lang });
        const latencyMs = Date.now() - t0;
        const dur = durationS ?? buf.length / 12000; // ~96 kbps AAC fallback estimate
        const s = scoreFile(entry, text);
        rows.push({ ...s, id, category: entry.category, latencyMs, costUsd: (dur / 60) * (PRICE_PER_MIN[cfg] ?? 0.006), transcript: text });
        if (cfg === configs[0]) manifest.push({ id, file: f, category: entry.category,
          mic: f.includes("_headset.") ? "headset" : "phone", reference_text: entry.text, names: entry.names });
        process.stdout.write(`  ${cfg} ${f}: NR ${s.nameFound}/${s.nameTotal}, WER ${(s.wer * 100).toFixed(0)}%\n`);
      } catch (e) { console.warn(`  ! ${cfg} ${f}: ${e.message}`); }
    }
    results[cfg] = { overall: aggregate(rows), byCategory: Object.fromEntries(
      [...new Set(rows.map(r => r.category))].sort().map(c => [c, aggregate(rows.filter(r => r.category === c))])),
      perFile: rows };
  }

  writeFileSync(join(HERE, "manifest.jsonl"), manifest.map(m => JSON.stringify(m)).join("\n") + "\n");
  const resDir = join(HERE, "results"); mkdirSync(resDir, { recursive: true });
  const stampArg = args.stamp; // pass --stamp for reproducible file names in CI
  const stamp = stampArg ?? new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const prev = existsSync(resDir) ? readdirSync(resDir).filter(f => f.endsWith(".json")).sort().pop() : null;
  writeFileSync(join(resDir, `${stamp}.json`), JSON.stringify(results, null, 2));

  console.log("\nконфиг            | гейт | NameRecall | AssigneeAcc | WrongRate | WER   | p50, мс | $ корпуса");
  console.log("------------------|------|------------|-------------|-----------|-------|---------|----------");
  for (const [cfg, r] of Object.entries(results)) {
    const a = r.overall;
    console.log(`${cfg.padEnd(18)}|  ${gate(a)}  |   ${pct(a.nameRecall)}  |    ${pct(a.assigneeAcc)}  |   ${pct(a.wrongRate)}  |${pct(a.wer)} | ${String(a.p50LatencyMs ?? "—").padStart(6)}  | $${a.costUsd.toFixed(3)}`);
    for (const c of ["D", "E"]) if (r.byCategory[c])
      console.log(`  └ категория ${c}   |      |   ${pct(r.byCategory[c].nameRecall)}  |    ${pct(r.byCategory[c].assigneeAcc)}  |   ${pct(r.byCategory[c].wrongRate)}  |${pct(r.byCategory[c].wer)} |`);
  }
  console.log("\nГейт (STT_GATE.md §7): NameRecall ≥95% ∧ AssigneeAcc ≥90% ∧ WrongRate ≤2% на микрофоне phone.");
  if (prev) {
    const old = JSON.parse(readFileSync(join(resDir, prev), "utf8"));
    console.log(`\nДельта к ${prev}:`);
    for (const cfg of Object.keys(results)) if (old[cfg])
      console.log(`  ${cfg}: NameRecall ${pct(old[cfg].overall.nameRecall)} → ${pct(results[cfg].overall.nameRecall)}`);
  }
}

/* ---------- entry ---------- */
const argv = process.argv.slice(2);
if (argv[0] === "smoke") {
  if (!argv[1]) { console.error('Использование: node run.mjs smoke <audio.m4a> "эталонный текст"'); process.exit(1); }
  await smoke(argv[1], argv.slice(2).join(" ") || null);
} else {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
  await fullRun(args);
}
