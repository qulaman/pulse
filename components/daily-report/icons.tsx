/** Line icons of the daily report — the stroke recipe of the profile and settings rows, 20px box, currentColor. */
const stroke = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** A clipboard with two lines: «Отчёт за день». */
export const ReportIcon = () => (
  <svg {...stroke}>
    <rect x="4.5" y="4" width="11" height="13" rx="2.2" />
    <path d="M7.8 4V3.2h4.4V4" />
    <path d="M7.5 9h5M7.5 12.5h3.5" />
  </svg>
);

/** The same clipboard ticked: the report is in. */
export const ReportDoneIcon = () => (
  <svg {...stroke}>
    <rect x="4.5" y="4" width="11" height="13" rx="2.2" />
    <path d="M7.8 4V3.2h4.4V4" />
    <path d="m7.4 10.8 2 2 3.4-3.8" />
  </svg>
);

/** Stacked columns: «Отчёты» of the team. */
export const ReportsIcon = () => (
  <svg {...stroke}>
    <path d="M4 16.5h12" />
    <path d="M6 14V9.5M10 14V5.5M14 14v-3" />
  </svg>
);
