/** Nav's icon set, pulled out on its own so Nav.tsx and More.tsx (Rules and
 *  Admin moved behind a "More" tab -- see docs/DECISIONS.md #10) can draw
 *  the same Rules/Admin glyphs without either file owning them or the
 *  markup getting copy-pasted between the two. */

export function iconProps() {
  return { viewBox: "0 0 24 24", width: 20, height: 20, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
}

export function IconBoard() {
  return (
    <svg {...iconProps()}>
      <line x1="5" y1="20" x2="5" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="19" y1="20" x2="19" y2="14" />
    </svg>
  );
}

export function IconMatches() {
  return (
    <svg {...iconProps()}>
      <line x1="6" y1="21" x2="6" y2="3" />
      <path d="M6 4h12l-3 4 3 4H6Z" />
    </svg>
  );
}

export function IconTeams() {
  return (
    <svg {...iconProps()}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="18" cy="9" r="2.5" />
      <path d="M15.3 14.2c2.9.4 5.2 2.8 5.2 5.8" />
    </svg>
  );
}

export function IconHistory() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="13" r="8" />
      <polyline points="12 9 12 13 15 15" />
      <path d="M3 8V4M3 4h4" />
    </svg>
  );
}

export function IconRules() {
  return (
    <svg {...iconProps()}>
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17Z" />
      <path d="M4 19a2.5 2.5 0 0 1 2.5-2.5H20" />
    </svg>
  );
}

export function IconAdmin() {
  return (
    <svg {...iconProps()}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
    </svg>
  );
}

export function IconMore() {
  return (
    <svg {...iconProps()}>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconChevron() {
  return (
    <svg {...iconProps()} width={18} height={18}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}
