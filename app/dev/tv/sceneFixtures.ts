import type { TvMoment } from "@/lib/tv/moment";
import type { TvPhoto } from "@/lib/tv/photos";
import type { TvSummary } from "@/lib/tv/queries";

/**
 * Fixtures of the D-185 scenes for `/dev/tv`: report photos, moments, a team of forty-two.
 * The photos are drawn placeholders (no network, no storage): a gradient with the object's name,
 * the size and the shape of a phone photo — 4:3 landscape and 3:4 portrait both.
 */

const MIN = 60_000;

/** A drawn «site photo»: sky, ground and the object of the report — in a phone photo's size and shape. */
type Shot = { sky: [string, string]; ground: string; horizon: number; body: (w: number, h: number) => string };

const SHOTS: Record<string, Shot> = {
  // a facade in scaffolding under a grey-blue sky
  facade: {
    sky: ["#9fb4c8", "#d5dde3"],
    ground: "#6b5a48",
    horizon: 0.78,
    body: (w, h) => {
      const x0 = w * 0.18;
      const bw = w * 0.64;
      const top = h * 0.2;
      const floors = 7;
      const fh = (h * 0.58) / floors;
      const windows = Array.from({ length: floors }, (_, f) =>
        Array.from({ length: 8 }, (_, c) => `<rect x="${x0 + 40 + c * (bw - 80) / 8}" y="${top + 24 + f * fh}" width="${(bw - 80) / 8 - 34}" height="${fh - 44}" fill="#2e3a44"/>`).join(""),
      ).join("");
      const scaffold = Array.from({ length: 9 }, (_, c) => `<rect x="${x0 + c * bw / 8 - 4}" y="${top - 30}" width="8" height="${h * 0.6}" fill="#b98a3e"/>`).join("") +
        Array.from({ length: floors + 1 }, (_, f) => `<rect x="${x0 - 10}" y="${top + f * fh - 4}" width="${bw + 20}" height="7" fill="#b98a3e"/>`).join("");
      return `<rect x="${x0}" y="${top}" width="${bw}" height="${h * 0.58}" fill="#c9b9a2"/>${windows}${scaffold}
<rect x="${w * 0.84}" y="${h * 0.08}" width="14" height="${h * 0.7}" fill="#d9a520"/><rect x="${w * 0.52}" y="${h * 0.08}" width="${w * 0.4}" height="12" fill="#d9a520"/>`;
    },
  },
  // close-up of fresh facade panels, a phone held upright
  panels: {
    sky: ["#8ea6ba", "#c4d0d9"],
    ground: "#5b5148",
    horizon: 0.9,
    body: (w, h) =>
      Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 3 }, (_, c) => `<rect x="${60 + c * (w - 120) / 3}" y="${80 + r * (h * 0.8) / 5}" width="${(w - 120) / 3 - 16}" height="${(h * 0.8) / 5 - 16}" fill="hsl(${28 + ((r + c) % 3) * 4},22%,${62 + ((r * 3 + c) % 4) * 3}%)"/>`).join(""),
      ).join(""),
  },
  // a bright overcast day over a new roof: the channel mark has to read on white
  roof: {
    sky: ["#f4f6f8", "#e3e8ec"],
    ground: "#8b8f93",
    horizon: 0.55,
    body: (w, h) =>
      `<polygon points="0,${h * 0.62} ${w},${h * 0.5} ${w},${h} 0,${h}" fill="#59636b"/>` +
      Array.from({ length: 14 }, (_, i) => `<line x1="${i * w / 13}" y1="${h * 0.62 - i * (h * 0.12) / 13}" x2="${i * w / 13 - 120}" y2="${h}" stroke="#7a858d" stroke-width="10"/>`).join("") +
      `<rect x="${w * 0.7}" y="${h * 0.3}" width="${w * 0.08}" height="${h * 0.22}" fill="#a65d3a"/>`,
  },
  // a fence along the plot, snow on the ground
  fence: {
    sky: ["#b9cbe0", "#eef2f6"],
    ground: "#e9edf0",
    horizon: 0.6,
    body: (w, h) =>
      Array.from({ length: 16 }, (_, i) => {
        const x = i * w / 15;
        const scale = 0.55 + (i / 15) * 0.6;
        return `<rect x="${x}" y="${h * (0.6 - 0.28 * scale)}" width="${18 * scale}" height="${h * 0.3 * scale}" fill="#3f4a52"/>`;
      }).join("") + `<polygon points="0,${h * 0.47} ${w},${h * 0.37} ${w},${h * 0.43} 0,${h * 0.52}" fill="#58656e"/>`,
  },
  // a window opening inside, the day bright behind it and a tape across
  window: {
    sky: ["#ded6cb", "#cfc5b8"],
    ground: "#9b8f80",
    horizon: 0.86,
    body: (w, h) =>
      `<rect x="${w * 0.2}" y="${h * 0.2}" width="${w * 0.6}" height="${h * 0.5}" fill="#f5f8fb"/><rect x="${w * 0.2}" y="${h * 0.2}" width="${w * 0.6}" height="${h * 0.5}" fill="none" stroke="#7d7166" stroke-width="22"/>` +
      `<rect x="${w * 0.16}" y="${h * 0.73}" width="${w * 0.68}" height="18" fill="#e3c21b"/>` +
      Array.from({ length: 12 }, (_, i) => `<rect x="${w * 0.16 + i * w * 0.0567}" y="${h * 0.73}" width="4" height="30" fill="#2b2b2b"/>`).join(""),
  },
};

function shot(kind: keyof typeof SHOTS, portrait = false): string {
  const [w, h] = portrait ? [1200, 1600] : [1600, 1200];
  const { sky, ground, horizon, body } = SHOTS[kind]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#s)"/><rect y="${h * horizon}" width="100%" height="${h * (1 - horizon)}" fill="${ground}"/>
${body(w, h)}
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Five photos of four reports from the week: two shapes, a bright sky, today and earlier days. */
export function photoFixtures(base: number, guest: boolean): TvPhoto[] {
  // id, task, person, name, picture, portrait, sent (minutes ago), handed in (minutes ago)
  const rows: [string, string, string, string, keyof typeof SHOTS, boolean, number, number][] = [
    ["ph1", "t-north", "p1", "Марат Ахметов", "facade", false, 58, 40],
    ["ph2", "t-north", "p1", "Марат Ахметов", "panels", true, 62, 40],
    ["ph3", "t-roof", "p3", "Ерлан Беков", "roof", false, 190, 175],
    ["ph4", "t-windows", "p4", "Динара Касымова", "window", true, 1_500, 1_480],
    ["ph5", "t-fence", "p5", "Айгуль Нурланова", "fence", false, 4_400, 4_380],
  ];
  const titles: Record<string, string> = {
    "t-north": "Леса сняты, фасад корпуса «Север» готов к приёмке",
    "t-roof": "Кровля второго корпуса",
    "t-fence": "Забор по периметру",
    "t-windows": "Замер окон на третьем этаже",
  };
  return rows.map(([id, task, employee, name, picture, portrait, sent, handed]) => ({
    id,
    url: shot(picture, portrait),
    task_id: task,
    employee_id: employee,
    name: guest ? name.split(" ")[0]! : name,
    title: guest ? null : titles[task]!,
    at: new Date(base - sent * MIN).toISOString(),
    done_at: new Date(base - handed * MIN).toISOString(),
  }));
}

export type MomentCase = "moment-points" | "moment-merch" | "moment-announce" | "moment-long";

export function momentFixture(wallCase: string, base: number): TvMoment | null {
  const at = new Date(base);
  switch (wallCase) {
    case "moment-points":
      return { id: "mo1", kind: "points", name: "Марат Ахметов", amount: 50, detail: "Сдал объект «Север» на день раньше", at };
    case "moment-merch":
      return { id: "mo2", kind: "merch", name: "Айгерим Сапарова", amount: null, detail: "Худи с логотипом", at };
    case "moment-announce":
      return { id: "mo3", kind: "announcement", name: "Директор", amount: null, detail: "В пятницу короткий день — до 16:00", at };
    case "moment-long":
      return {
        id: "mo4",
        kind: "announcement",
        name: "Директор",
        amount: null,
        detail: "С понедельника въезд на объект «Север» только по пропускам — пропуска выдаёт Асель в кабинете снабжения до 10:00",
        at,
      };
    default:
      return null;
  }
}

/** Forty-two people: the team scene pages through them (D-185). */
export function bigTeam(summary: TvSummary, guest: boolean): TvSummary {
  // a man's name with a man's surname, a woman's with a woman's: a mixed pair is the first thing
  // anyone in Kazakhstan would notice on a demo
  const men = ["Айбек", "Бауыржан", "Дамир", "Ильяс", "Нурсултан", "Тимур", "Шынгыс", "Ерлан", "Арман", "Канат", "Руслан"];
  const women = ["Асель", "Гульнара", "Жанар", "Камила", "Сабина", "Улжан", "Фарида", "Айгерим", "Динара", "Мадина"];
  const surnames = ["Абенов", "Жумабаев", "Касымов", "Мухамеджанов", "Оспанов", "Сарсенбаев", "Тулегенов", "Ахметов", "Нурланов", "Серикбаев"];
  const load = Array.from({ length: 42 }, (_, i) => {
    const woman = i % 2 === 1;
    const pool = woman ? women : men;
    const first = pool[Math.floor(i / 2) % pool.length]!;
    const surname = surnames[(i * 3 + Math.floor(i / 20)) % surnames.length]!;
    const name = `${first} ${woman ? `${surname}а` : surname}`;
    return { name: guest ? first : name, active: (i * 7) % 6, overdue: 0 };
  });
  return { ...summary, load };
}
