/** Line icons for the profile rows — one stroke recipe, 20px box, currentColor. */
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

export const LockIcon = () => (
  <svg {...stroke}>
    <rect x="4" y="8.5" width="12" height="8" rx="2.5" />
    <path d="M7 8.5V6.5a3 3 0 0 1 6 0v2" />
    <circle cx="10" cy="12.5" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const BellIcon = () => (
  <svg {...stroke}>
    <path d="M5.5 13.5V9a4.5 4.5 0 0 1 9 0v4.5l1 1.5h-11z" />
    <path d="M8.3 17a1.9 1.9 0 0 0 3.4 0" />
  </svg>
);

export const SendIcon = () => (
  <svg {...stroke}>
    <path d="M16.5 4 3.5 9.2l4.6 1.7L16.5 4z" />
    <path d="M16.5 4l-2.2 12-6.2-5.1L16.5 4z" />
  </svg>
);

export const GearIcon = () => (
  <svg {...stroke}>
    <circle cx="10" cy="10" r="2.4" />
    <path d="M10 3.2v1.9M10 14.9v1.9M3.2 10h1.9M14.9 10h1.9M5.2 5.2l1.4 1.4M13.4 13.4l1.4 1.4M5.2 14.8l1.4-1.4M13.4 6.6l1.4-1.4" />
  </svg>
);

export const ExitIcon = () => (
  <svg {...stroke}>
    <path d="M12 6V4.5A1.5 1.5 0 0 0 10.5 3h-5A1.5 1.5 0 0 0 4 4.5v11A1.5 1.5 0 0 0 5.5 17h5a1.5 1.5 0 0 0 1.5-1.5V14" />
    <path d="M8.5 10h8M14 7.5 16.5 10 14 12.5" />
  </svg>
);

/** «Проверить уведомления»: a heartbeat line — the channel is alive or it is not. */
export const PulseIcon = () => (
  <svg {...stroke}>
    <path d="M2.5 10.5h3.2l1.8-4.5 3 8.5 2-5.5 1.3 1.5h3.7" />
  </svg>
);
