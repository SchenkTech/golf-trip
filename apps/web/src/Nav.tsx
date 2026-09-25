import { Link, usePath } from "./router.tsx";
import InstallButton from "./InstallButton.tsx";
import { IconBoard, IconMatches, IconTeams, IconHistory, IconMore } from "./icons.tsx";
import "./Nav.css";

// Board centred, per docs/SPEC.md ("a handful of tabs with Board in the
// centre and active by default"). Rules and Admin moved behind "More"
// (docs/DECISIONS.md #10) -- neither is a screen most visits touch, and a
// six-wide bar was cramped on a phone held one-handed.
const TABS = [
  { to: "/matches", label: "Matches", Icon: IconMatches },
  { to: "/teams", label: "Teams", Icon: IconTeams },
  { to: "/", label: "Board", Icon: IconBoard },
  { to: "/history", label: "History", Icon: IconHistory },
  { to: "/more", label: "More", Icon: IconMore },
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
          // More stays lit for both screens behind it (Rules, Admin), so
          // leaving Rules for Admin doesn't read as leaving the section.
          const active =
            to === "/"
              ? path === "/"
              : to === "/matches"
                ? path.startsWith("/matches") || path.startsWith("/trips/")
                : to === "/more"
                  ? path.startsWith("/more") || path.startsWith("/rules") || path.startsWith("/admin")
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
