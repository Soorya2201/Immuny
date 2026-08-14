// Aquatic avatars used to identify each person the app tracks.
//
// Deliberately drawn rather than emoji: emoji render differently on every
// platform, can't be tinted to match the app, and read as decoration instead of
// identity. These follow the stroke style of icons.tsx but take a `size` prop —
// they appear at ~26px in the header chip, 34px in the switcher popover and
// 44px in the profile picker, and a fixed-size icon would look wrong at two of
// those three.

// This file exports only components, so Fast Refresh keeps working. The
// registry that pairs them with names and tints lives in utils/avatars.ts.
export interface AvatarProps {
  size?: number;
}

// Shared frame so every creature lines up on the same grid and stroke weight.
function Frame({ size = 24, children }: AvatarProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// Body fill — a wash of the same colour as the stroke, so a single `color` on
// the parent tints the whole creature.
const wash = { fill: 'currentColor', fillOpacity: 0.16 } as const;

export const OctopusAvatar = ({ size }: AvatarProps) => (
  <Frame size={size}>
    <path d="M5.5 13.6a6.5 6.1 0 0 1 13 0v.9h-13z" {...wash} />
    <path d="M6.2 14.5c-.5 1.9-1.5 2.9-2.9 3.5M9.7 14.5c-.4 2.3-.2 3.8.5 5.2M14.3 14.5c.4 2.3.2 3.8-.5 5.2M17.8 14.5c.5 1.9 1.5 2.9 2.9 3.5" />
    <circle cx="9.9" cy="11.6" r=".95" fill="currentColor" stroke="none" />
    <circle cx="14.1" cy="11.6" r=".95" fill="currentColor" stroke="none" />
  </Frame>
);

export const SeahorseAvatar = ({ size }: AvatarProps) => (
  <Frame size={size}>
    <path
      d="M14.6 3.6c-2.7 0-4.4 1.9-4.4 4.2 0 2.5 1.9 3.5 1.9 5.6 0 1.7-1.1 2.5-1.1 4.2 0 1.7 1.3 2.8 2.8 2.8 1.4 0 2.2-.8 2.2-1.8"
      {...wash}
    />
    <path d="m14.6 3.6 3.2 1.6" />
    <path d="M10.3 8.7c-1.5.3-2.3 1.5-2.3 2.8M11.8 13.8c-1.4.4-2.1 1.5-2.1 2.7" />
    <circle cx="13.3" cy="6.2" r=".85" fill="currentColor" stroke="none" />
  </Frame>
);

export const ClownfishAvatar = ({ size }: AvatarProps) => (
  <Frame size={size}>
    <ellipse cx="10.6" cy="12" rx="6.6" ry="4.9" {...wash} />
    <path d="M17.2 12c1.6-2.1 3.4-3.1 3.4-3.1v6.2s-1.8-1-3.4-3.1z" {...wash} />
    <path d="M9.2 7.5v9M12.9 8.3v7.4" />
    <circle cx="6.4" cy="10.7" r=".9" fill="currentColor" stroke="none" />
  </Frame>
);

export const JellyfishAvatar = ({ size }: AvatarProps) => (
  <Frame size={size}>
    <path d="M4.6 13a7.4 6.8 0 0 1 14.8 0v.6H4.6z" {...wash} />
    <path d="M7.1 14.2c0 2.7-1 3.6-1 5.5M10.4 14.2c0 3.1-.6 4.2-.6 6.1M13.6 14.2c0 3.1.6 4.2.6 6.1M16.9 14.2c0 2.7 1 3.6 1 5.5" />
    <circle cx="10.2" cy="10.9" r=".9" fill="currentColor" stroke="none" />
    <circle cx="13.8" cy="10.9" r=".9" fill="currentColor" stroke="none" />
  </Frame>
);

export const TurtleAvatar = ({ size }: AvatarProps) => (
  <Frame size={size}>
    <ellipse cx="12" cy="13" rx="5.4" ry="4.8" {...wash} />
    <circle cx="12" cy="5.9" r="2" {...wash} />
    <path d="m7.2 9.9-2.6-1.8M16.8 9.9l2.6-1.8M7.2 16.2l-2.6 1.9M16.8 16.2l2.6 1.9" />
    <path d="M12 8.2v9.6M7 11.6h10M7.6 15.1h8.8" />
  </Frame>
);

export const WhaleAvatar = ({ size }: AvatarProps) => (
  <Frame size={size}>
    <path d="M3.4 13.2c0-3.7 3.1-6.4 7.2-6.4s7.2 2.7 7.2 6.4-3.1 5.8-7.2 5.8-7.2-2.1-7.2-5.8z" {...wash} />
    <path d="M17.8 13.1c1-1.7 2.2-2.5 3.5-2.7v5.8c-1.3-.2-2.5-1.3-3.5-3.1z" {...wash} />
    <path d="M8.6 6.9c0-1.5.6-2.6 1.7-3.2" />
    <path d="M4.9 16.1c2.5 1.3 5.8 1.4 8.7.4" />
    <circle cx="7.1" cy="12.1" r=".9" fill="currentColor" stroke="none" />
  </Frame>
);

export const StarfishAvatar = ({ size }: AvatarProps) => (
  <Frame size={size}>
    <path
      d="M12 3.4 14.35 9.16 20.56 9.62 15.8 13.64 17.29 19.68 12 16.4 6.71 19.68 8.2 13.64 3.44 9.62 9.65 9.16Z"
      {...wash}
    />
    <circle cx="12" cy="11.4" r=".8" fill="currentColor" stroke="none" />
    <circle cx="10.1" cy="13.4" r=".65" fill="currentColor" stroke="none" />
    <circle cx="13.9" cy="13.4" r=".65" fill="currentColor" stroke="none" />
  </Frame>
);

export const CrabAvatar = ({ size }: AvatarProps) => (
  <Frame size={size}>
    <ellipse cx="12" cy="14" rx="5.9" ry="4.1" {...wash} />
    <path d="m9.7 10.4-1.1-2.3M14.3 10.4l1.1-2.3" />
    <circle cx="8.3" cy="7.1" r="1.05" {...wash} />
    <circle cx="15.7" cy="7.1" r="1.05" {...wash} />
    <path d="M6.3 12.3 3.7 10.5a1.9 1.9 0 0 1 .5-3M17.7 12.3l2.6-1.8a1.9 1.9 0 0 0-.5-3" />
    <path d="m6.4 16.3-2.5 1.4M7 18.2l-1.9 2M17.6 16.3l2.5 1.4M17 18.2l1.9 2" />
  </Frame>
);

export const DolphinAvatar = ({ size }: AvatarProps) => (
  <Frame size={size}>
    <path
      d="M21 7.4c-2.1.3-3.9 1.2-5.3 2.6-1.9 2-4.2 3.3-6.9 3.3-1.7 0-3.2-.4-4.5-1.2.2 3.7 3.4 6.5 7.5 6.5 5 0 9-3.9 9.2-8.9z"
      {...wash}
    />
    <path d="M13.6 10.1c.3-2-.2-3.8-1.5-5.3 2.2.2 4 1.4 5.1 3.2" />
    <path d="M5.1 17.4c-1.1.9-2.3 1.2-3.6 1 .8-1 1.1-2.1.9-3.3" {...wash} />
    <circle cx="17.9" cy="9.6" r=".85" fill="currentColor" stroke="none" />
  </Frame>
);

export const PufferfishAvatar = ({ size }: AvatarProps) => (
  <Frame size={size}>
    <circle cx="11.6" cy="12.1" r="5.9" {...wash} />
    <path d="M11.6 6.2V4.1M15.8 7.9l1.5-1.5M17.5 12.1h2.1M15.8 16.3l1.5 1.5M11.6 18v2.1M7.4 16.3l-1.5 1.5M5.7 12.1H3.6M7.4 7.9 5.9 6.4" />
    <circle cx="9.5" cy="10.9" r=".9" fill="currentColor" stroke="none" />
    <circle cx="13.7" cy="10.9" r=".9" fill="currentColor" stroke="none" />
    <path d="M10 14.5c1 .8 2.2.8 3.2 0" />
  </Frame>
);
