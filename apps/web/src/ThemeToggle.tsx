import { useState } from "react";
import type { ReactElement } from "react";
import { getThemeChoice, setThemeChoice } from "./lib/theme.ts";
import type { ThemeChoice } from "./lib/theme.ts";
import "./ThemeToggle.css";

/** The cycle, in this order. "Auto" comes first because it's the default
 *  and the one most people should stay on -- the other two are for the
 *  person who wants to override their phone. */
const ORDER: ThemeChoice[] = ["system", "light", "dark"];

const LABEL: Record<ThemeChoice, string> = {
  system: "Auto",
  light: "Light",
  dark: "Dark",
};

function iconProps() {
  return {
    viewBox: "0 0 24 24",
    width: 18,
    height: 18,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

function IconAuto() {
  // Half-filled circle: the app follows the phone, whichever way it's set.
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconLight() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </svg>
  );
}

function IconDark() {
  return (
    <svg {...iconProps()}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

const ICON: Record<ThemeChoice, () => ReactElement> = {
  system: IconAuto,
  light: IconLight,
  dark: IconDark,
};

/**
 * One button in the bottom corner of every screen, not a three-way pill:
 * the pill was ~170px of chrome parked on top of whatever was underneath
 * it (match cards, the all-time table), for a setting somebody touches
 * once a year. Tapping cycles Auto -> Light -> Dark, and the icon is the
 * state -- there's nothing to read, and nothing to open.
 *
 * Bottom corner rather than the top bar (alongside the install button)
 * because the top bar is already tight on a narrow phone, which is the
 * exact one-handed-on-a-tee context this app cares most about.
 */
export default function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(getThemeChoice());
  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
  const Icon = ICON[choice];

  return (
    <button
      className="theme-toggle"
      // Says both where you are and where a tap lands -- the icon alone
      // can't carry that for a screen reader.
      aria-label={`Theme: ${LABEL[choice]}. Switch to ${LABEL[next]}.`}
      title={`Theme: ${LABEL[choice]} — tap for ${LABEL[next]}`}
      onClick={() => {
        setThemeChoice(next);
        setChoice(next);
      }}
    >
      <Icon />
    </button>
  );
}
