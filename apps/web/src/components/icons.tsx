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

export const PlusIcon = () => (
  <svg {...stroke} strokeWidth={2}>
    <path d="M10 4v12M4 10h12" />
  </svg>
);

/** U-Cut's mark. Two halves that pivot, so the blades can snip. */
export const Scissors = () => (
  <svg className="scissors" viewBox="0 0 128 120" aria-hidden="true">
    <g className="scissors-half scissors-up">
      <circle cx="21" cy="87" r="14" fill="none" stroke="currentColor" strokeWidth="13" />
      <path
        d="M34 77 60 60"
        fill="none"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <path d="M44 72 126 32 70 46Z" fill="currentColor" />
    </g>
    <g className="scissors-half scissors-down">
      <circle cx="21" cy="33" r="14" fill="none" stroke="currentColor" strokeWidth="13" />
      <path
        d="M34 43 60 60"
        fill="none"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <path d="M44 48 126 88 70 74Z" fill="currentColor" />
    </g>
    <circle className="scissors-pin" cx="60" cy="60" r="5" />
  </svg>
);
