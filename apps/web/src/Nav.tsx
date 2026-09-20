import { Link, usePath } from "./router.tsx";
import InstallButton from "./InstallButton.tsx";
import "./Nav.css";

function iconProps() {
  return { viewBox: "0 0 24 24", width: 20, height: 20, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
}

function IconBoard() {
  return (
    <svg {...iconProps()}>
      <line x1="5" y1="20" x2="5" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="19" y1="20" x2="19" y2="14" />
    </svg>
  );
}

function IconMatches() {
  return (
    <svg {...iconProps()}>
      <line x1="6" y1="21" x2="6" y2="3" />
      <path d="M6 4h12l-3 4 3 4H6Z" />
    </svg>
  );
}

function IconTeams() {
  return (
    <svg {...iconProps()}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="18" cy="9" r="2.5" />
      <path d="M15.3 14.2c2.9.4 5.2 2.8 5.2 5.8" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="13" r="8" />
      <polyline points="12 9 12 13 15 15" />
      <path d="M3 8V4M3 4h4" />
    </svg>
  );
}

function IconRules() {
  return (
    <svg {...iconProps()}>
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17Z" />
      <path d="M4 19a2.5 2.5 0 0 1 2.5-2.5H20" />
    </svg>
  );
}

function IconAdmin() {
  return (
    <svg {...iconProps()}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
    </svg>
  );
}

const TABS = [
  { to: "/", label: "Board", Icon: IconBoard },
  { to: "/matches", label: "Matches", Icon: IconMatches },
  { to: "/teams", label: "Teams", Icon: IconTeams },
  { to: "/history", label: "History", Icon: IconHistory },
  { to: "/rules", label: "Rules", Icon: IconRules },
  { to: "/admin", label: "Admin", Icon: IconAdmin },
];

/** A fixed bottom tab bar, not a top row -- thumb reach on a phone held
 *  one-handed (or propped on a cart) beats a header strip you have to
 *  reach up for, and it's the same convention every reference PWA in this
 *  space (stolentee.lovable.app included) already uses. Always on, not
 *  just in installed/PWA mode -- one layout to maintain, and it costs
 *  nothing on desktop. InstallButton renders alongside it (so it only ever
 *  shows up on screens that have a Nav) but as a sibling, not a child --
 *  .bottom-nav's own `transform` (the iOS fixed-position fix) would
 *  otherwise become the containing block for InstallButton's `position:
 *  fixed`, pinning it to the nav bar's corner instead of the viewport's. */
export default function Nav() {
  const path = usePath();

  return (
    <>
      <nav className="bottom-nav">
        {TABS.map(({ to, label, Icon }) => {
          // A past trip (`/trips/2026`) is the Matches screen with its trip
          // picker pointed elsewhere, so that tab stays lit while you're in
          // one -- otherwise picking last year appears to leave the section.
          const active =
            to === "/"
              ? path === "/"
              : to === "/matches"
                ? path.startsWith("/matches") || path.startsWith("/trips/")
                : path.startsWith(to);
          return (
            <Link key={to} to={to} className={`bottom-nav-link ${active ? "active" : ""}`}>
              <Icon />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <InstallButton />
    </>
  );
}
