/** Line icons for the settings rows and sections — one stroke recipe, 20px box. */
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

export const PeopleIcon = () => (
  <svg {...stroke}>
    <circle cx="8" cy="7.5" r="2.6" />
    <path d="M3.2 16.5a4.8 4.8 0 0 1 9.6 0" />
    <path d="M13.2 5.4a2.6 2.6 0 0 1 0 5M14.5 12.4a4.5 4.5 0 0 1 2.4 4.1" />
  </svg>
);

export const ListIcon = () => (
  <svg {...stroke}>
    <polyline points="3.5,6 5,7.5 7.5,5" />
    <polyline points="3.5,13 5,14.5 7.5,12" />
    <line x1="10" y1="6.2" x2="16.5" y2="6.2" />
    <line x1="10" y1="13.2" x2="16.5" y2="13.2" />
  </svg>
);

export const TableIcon = () => (
  <svg {...stroke}>
    <rect x="3.2" y="4" width="13.6" height="12" rx="2.2" />
    <line x1="3.2" y1="8" x2="16.8" y2="8" />
    <line x1="8" y1="8" x2="8" y2="16" />
  </svg>
);

export const MicIcon = () => (
  <svg {...stroke}>
    <rect x="7.8" y="2.8" width="4.4" height="8.4" rx="2.2" />
    <path d="M5 9.5a5 5 0 0 0 10 0" />
    <line x1="10" y1="14.5" x2="10" y2="17" />
  </svg>
);

export const ParseIcon = () => (
  <svg {...stroke}>
    <path d="M10 2.8 11.6 6l3.6.4-2.7 2.4.8 3.5L10 10.6 6.7 12.3l.8-3.5L4.8 6.4 8.4 6z" />
    <path d="M4.5 15.5h11" />
  </svg>
);

export const BookIcon = () => (
  <svg {...stroke}>
    <path d="M4 4.5h4.2A1.8 1.8 0 0 1 10 6.3v9.2a1.5 1.5 0 0 0-1.5-1.5H4z" />
    <path d="M16 4.5h-4.2A1.8 1.8 0 0 0 10 6.3v9.2a1.5 1.5 0 0 1 1.5-1.5H16z" />
  </svg>
);

export const ClockIcon = () => (
  <svg {...stroke}>
    <circle cx="10" cy="10" r="7" />
    <polyline points="10,5.8 10,10.2 13,11.8" />
  </svg>
);

export const StarIcon = () => (
  <svg {...stroke}>
    <path d="M10 3.2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 14l-4.2 2.2.8-4.7L3.2 8.2l4.7-.7z" />
  </svg>
);

export const MoonIcon = () => (
  <svg {...stroke}>
    <path d="M16 11.4A6.4 6.4 0 0 1 8.6 4a6.6 6.6 0 1 0 7.4 7.4z" />
  </svg>
);

export const CupIcon = () => (
  <svg {...stroke}>
    <path d="M3.6 7.6h10v4.6a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4z" />
    <path d="M13.6 8.8h1.2a2 2 0 0 1 0 4h-1.2M6.6 2.6v2.2M10.2 2.6v2.2" />
  </svg>
);

export const BuildingIcon = () => (
  <svg {...stroke}>
    <path d="M3.5 17V5.4a1.4 1.4 0 0 1 1.4-1.4h5.2a1.4 1.4 0 0 1 1.4 1.4V17" />
    <path d="M11.5 8.5h3.6a1.4 1.4 0 0 1 1.4 1.4V17" />
    <path d="M2.5 17h15M6 7h3M6 10h3M6 13h3M13.5 11.5h1.5M13.5 14h1.5" />
  </svg>
);

export const TrashIcon = () => (
  <svg {...stroke}>
    <path d="M4.5 6h11M8 6V4.6A1.1 1.1 0 0 1 9.1 3.5h1.8A1.1 1.1 0 0 1 12 4.6V6" />
    <path d="M6 6l.7 9.4A1.6 1.6 0 0 0 8.3 17h3.4a1.6 1.6 0 0 0 1.6-1.6L14 6" />
    <path d="M8.6 9v5M11.4 9v5" />
  </svg>
);

/** «Программа»: the app's modules, four squares. */
export const AppsIcon = () => (
  <svg {...stroke}>
    <rect x="3.2" y="3.2" width="5.6" height="5.6" rx="1.6" />
    <rect x="11.2" y="3.2" width="5.6" height="5.6" rx="1.6" />
    <rect x="3.2" y="11.2" width="5.6" height="5.6" rx="1.6" />
    <rect x="11.2" y="11.2" width="5.6" height="5.6" rx="1.6" />
  </svg>
);

/** «ИИ-модель»: a large spark and a small one. */
export const SparkIcon = () => (
  <svg {...stroke}>
    <path d="M8.4 3.2c.5 3 1.6 4.1 4.6 4.6-3 .5-4.1 1.6-4.6 4.6-.5-3-1.6-4.1-4.6-4.6 3-.5 4.1-1.6 4.6-4.6z" />
    <path d="M14.6 11.6c.3 1.7.9 2.3 2.6 2.6-1.7.3-2.3.9-2.6 2.6-.3-1.7-.9-2.3-2.6-2.6 1.7-.3 2.3-.9 2.6-2.6z" />
  </svg>
);

export const GiftIcon = () => (
  <svg {...stroke}>
    <rect x="2.8" y="8.4" width="14.4" height="8.4" rx="1.4" />
    <path d="M2 6.2h16v2.2H2zM10 6.2v10.6" />
    <path d="M10 6.2C8.6 6.2 6.4 6 6 4.6A1.8 1.8 0 0 1 8.4 2.6c1.2.5 1.6 2.3 1.6 3.6zM10 6.2c1.4 0 3.6-.2 4-1.6A1.8 1.8 0 0 0 11.6 2.6C10.4 3.1 10 4.9 10 6.2z" />
  </svg>
);

export const TvIcon = () => (
  <svg {...stroke}>
    <rect x="2.6" y="3.6" width="14.8" height="10" rx="1.6" />
    <path d="M7 16.4h6M10 13.6v2.8" />
  </svg>
);

export const CalendarIcon = () => (
  <svg {...stroke}>
    <rect x="2.8" y="4.4" width="14.4" height="12" rx="1.6" />
    <path d="M6.8 2.6v3.6M13.2 2.6v3.6M2.8 8.6h14.4" />
  </svg>
);

/** Рейтинг: a three-step podium. */
export const PodiumIcon = () => (
  <svg {...stroke}>
    <path d="M7.4 16.6V6.8h5.2v9.8M2.8 16.6v-6h4.6M17.2 16.6v-4.2h-4.6M2 16.6h16" />
  </svg>
);

/** Загрузка команды: bars of how busy people are. */
export const LoadIcon = () => (
  <svg {...stroke}>
    <path d="M4 16.5V11M8 16.5V5.5M12 16.5V8.5M16 16.5V3.5" />
  </svg>
);

export const PersonIcon = () => (
  <svg {...stroke}>
    <circle cx="10" cy="7" r="3" />
    <path d="M4.5 16.5a5.5 5.5 0 0 1 11 0" />
  </svg>
);

export const CrownIcon = () => (
  <svg {...stroke}>
    <path d="M3.5 14.5 2.8 6.5l4.2 3.2L10 4.5l3 5.2 4.2-3.2-.7 8z" />
    <line x1="4" y1="16.8" x2="16" y2="16.8" />
  </svg>
);

export const KeyIcon = () => (
  <svg {...stroke}>
    <circle cx="6.8" cy="12.8" r="3.3" />
    <path d="m9.2 10.4 6.8-6.8M13.4 6.2l2 2M11.6 8l1.6 1.6" />
  </svg>
);

export const MailIcon = () => (
  <svg {...stroke}>
    <rect x="2.8" y="4.5" width="14.4" height="11" rx="2.2" />
    <path d="m3.4 5.6 6.6 5.2 6.6-5.2" />
  </svg>
);
