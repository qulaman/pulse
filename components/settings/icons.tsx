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
