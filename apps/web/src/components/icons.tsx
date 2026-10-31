const base = { width: 20, height: 20, viewBox: "0 0 20 20", "aria-hidden": true } as const;

export const PlayIcon = () => (
  <svg {...base} fill="currentColor">
    <path d="M6 3.8c0-.8.9-1.3 1.6-.9l9 6.2c.6.4.6 1.3 0 1.8l-9 6.2c-.7.4-1.6 0-1.6-.9V3.8Z" />
  </svg>
);

export const PauseIcon = () => (
  <svg {...base} fill="currentColor">
    <rect x="4.5" y="3" width="4" height="14" rx="1.2" />
    <rect x="11.5" y="3" width="4" height="14" rx="1.2" />
  </svg>
);

const stroke = {
  ...base,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const UndoIcon = () => (
  <svg {...stroke}>
    <path d="M7.5 5 3.5 9l4 4" />
    <path d="M3.5 9h8.2a4.8 4.8 0 0 1 0 9.6H9" />
  </svg>
);

export const RedoIcon = () => (
  <svg {...stroke}>
    <path d="m12.5 5 4 4-4 4" />
    <path d="M16.5 9H8.3a4.8 4.8 0 0 0 0 9.6H11" />
  </svg>
);

export const SoundIcon = () => (
  <svg {...stroke}>
    <path d="M3 8v4h3l4 3.5v-11L6 8H3Z" />
    <path d="M13 7.2a4 4 0 0 1 0 5.6M15.2 5a7 7 0 0 1 0 10" />
  </svg>
);

export const MuteIcon = () => (
  <svg {...stroke}>
    <path d="M3 8v4h3l4 3.5v-11L6 8H3Z" />
    <path d="m13.5 8 4 4m0-4-4 4" />
  </svg>
);
