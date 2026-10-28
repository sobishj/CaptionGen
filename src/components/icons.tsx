import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      width="1em"
      height="1em"
      {...props}
    >
      {children}
    </svg>
  );
}

export const LogoMark = (p: IconProps) => (
  <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" {...p}>
    <rect width="32" height="32" rx="7" fill="#c8235c" />
    <path d="M9 11h14M9 16h10M9 21h6" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

export const CopyIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="8" y="8" width="13" height="13" rx="2" />
    <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
  </Base>
);

export const HashIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 9h14M5 15h14M10 3L8 21M16 3l-2 18" />
  </Base>
);

export const RefreshIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4" />
  </Base>
);

export const AlertIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17v.01" />
  </Base>
);

export const CheckIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Base>
);

export const CpuIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
  </Base>
);

const PLATFORM_LOGOS = {
  instagram: {
    label: "Instagram",
    background: "radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285aeb 90%)",
    radius: "28%",
    glyph: (
      <g fill="none" stroke="#fff" strokeWidth="1.9">
        <rect x="5.5" y="5.5" width="13" height="13" rx="3.8" />
        <circle cx="12" cy="12" r="3.1" />
        <circle cx="15.9" cy="8.1" r="0.5" fill="#fff" stroke="none" />
      </g>
    ),
  },
  linkedin: {
    label: "LinkedIn",
    background: "#0a66c2",
    radius: "18%",
    glyph: (
      <g fill="#fff">
        <circle cx="7.4" cy="7.4" r="1.65" />
        <rect x="6" y="9.6" width="2.8" height="8.4" />
        <path d="M10.9 9.6h2.7v1.2c.4-.7 1.3-1.4 2.7-1.4 2.6 0 3.1 1.7 3.1 3.9V18h-2.8v-4.1c0-1 0-2.3-1.4-2.3s-1.6 1.1-1.6 2.2V18h-2.7z" />
      </g>
    ),
  },
  facebook: {
    label: "Facebook",
    background: "#1877f2",
    radius: "50%",
    glyph: (
      <path
        fill="#fff"
        d="M13.4 24v-8.4h2.8l.45-3.3H13.4v-2.1c0-.95.27-1.6 1.63-1.6h1.74V5.65c-.3-.04-1.33-.13-2.53-.13-2.5 0-4.22 1.53-4.22 4.34v2.44H7.2v3.3H10V24z"
      />
    ),
  },
} as const;

/** Full-colour platform logo (brand colours), as a decorative image. */
export function PlatformLogo({
  platform,
  size = 20,
  className = "",
  style,
}: {
  platform: keyof typeof PLATFORM_LOGOS;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const logo = PLATFORM_LOGOS[platform];
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`}
      style={{ width: size, height: size, background: logo.background, borderRadius: logo.radius, ...style }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} focusable="false">
        {logo.glyph}
      </svg>
    </span>
  );
}
