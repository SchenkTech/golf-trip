import { Link } from "./router.tsx";
import { IconRules, IconAdmin, IconChevron } from "./icons.tsx";
import "./More.css";

const ITEMS = [
  { to: "/rules", label: "Rules", sub: "Formats, handicaps, how points work", Icon: IconRules },
  { to: "/admin", label: "Admin", sub: "Set up the event, teams, matchups", Icon: IconAdmin },
];

/** Everything that isn't one of the four screens most visits touch (Board,
 *  Matches, Teams, History) -- see docs/DECISIONS.md #10. Just a list of
 *  links; Rules and Admin stay their own screens with their own routes, so
 *  a link to either still works without going through here first. */
export default function More() {
  return (
    <main className="board more-page">
      <header className="page-header">
        <h1>More</h1>
      </header>

      <div className="more-list">
        {ITEMS.map(({ to, label, sub, Icon }) => (
          <Link key={to} to={to} className="more-link">
            <span className="more-link-icon">
              <Icon />
            </span>
            <span className="more-link-text">
              <span className="more-link-label">{label}</span>
              <span className="more-link-sub">{sub}</span>
            </span>
            <IconChevron />
          </Link>
        ))}
      </div>
    </main>
  );
}
