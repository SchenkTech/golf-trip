import { useEffect, useState } from "react";
import { api } from "./api.ts";
import { Link } from "./router.tsx";
import { IconRules, IconAdmin, IconPhotos, IconChevron } from "./icons.tsx";
import "./More.css";

const ITEMS = [
  { to: "/rules", label: "Rules", sub: "Formats, handicaps, how points work", Icon: IconRules },
  { to: "/admin", label: "Admin", sub: "Set up the event, teams, matchups", Icon: IconAdmin },
];

/** Everything that isn't one of the four screens most visits touch (Board,
 *  Matches, Teams, History) -- see docs/DECISIONS.md #10. Just a list of
 *  links; Rules and Admin stay their own screens with their own routes, so
 *  a link to either still works without going through here first.
 *
 *  Photos only joins the list while the current event actually has an
 *  album open (event.photosEnabled) -- off by default, so most groups
 *  and most of the year this screen stays exactly the four items it
 *  already was (docs/DECISIONS.md #11). */
export default function More() {
  const [photosEnabled, setPhotosEnabled] = useState(false);

  useEffect(() => {
    api
      .currentEvent()
      .then((ev) => setPhotosEnabled(ev.photosEnabled))
      .catch(() => {}); // no event, or offline -- Photos just stays off the list
  }, []);

  const items = photosEnabled
    ? [{ to: "/photos", label: "Photos", sub: "Trip photos, open for this event", Icon: IconPhotos }, ...ITEMS]
    : ITEMS;

  return (
    <main className="board more-page">
      <header className="page-header">
        <h1>More</h1>
      </header>

      <div className="more-list">
        {items.map(({ to, label, sub, Icon }) => (
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
