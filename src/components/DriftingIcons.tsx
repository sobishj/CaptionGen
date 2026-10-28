import type { CSSProperties } from "react";
import { PlatformLogo } from "./icons";

const PLATFORMS = ["instagram", "facebook", "linkedin"] as const;

/**
 * Decorative background: faint platform icons drifting slowly left to right.
 * Negative delays spread them across the screen from the first frame.
 */
const ITEMS = [
  { top: "8%", size: 56, duration: 150, delay: -20, tilt: -8, opacity: 0.24 },
  { top: "18%", size: 32, duration: 110, delay: -75, tilt: 6, opacity: 0.22 },
  { top: "29%", size: 72, duration: 190, delay: -130, tilt: 10, opacity: 0.20 },
  { top: "41%", size: 40, duration: 130, delay: -40, tilt: -4, opacity: 0.24 },
  { top: "52%", size: 28, duration: 100, delay: -10, tilt: 12, opacity: 0.22 },
  { top: "63%", size: 64, duration: 170, delay: -95, tilt: -10, opacity: 0.20 },
  { top: "74%", size: 36, duration: 120, delay: -60, tilt: 4, opacity: 0.24 },
  { top: "86%", size: 48, duration: 160, delay: -140, tilt: -6, opacity: 0.22 },
  { top: "94%", size: 30, duration: 115, delay: -35, tilt: 8, opacity: 0.20 },
];

export function DriftingIcons() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {ITEMS.map((item, i) => {
        const platform = PLATFORMS[i % PLATFORMS.length]!;
        const style = {
          top: item.top,
          opacity: item.opacity,
          "--duration": `${item.duration}s`,
          "--delay": `${item.delay}s`,
          "--tilt": `${item.tilt}deg`,
          "--rest": `${(i * 37) % 90}vw`,
        } as CSSProperties;
        return (
          <span key={i} className="drift-icon" style={style}>
            <PlatformLogo platform={platform} size={item.size} />
          </span>
        );
      })}
    </div>
  );
}
