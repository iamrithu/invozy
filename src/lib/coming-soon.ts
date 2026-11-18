// Copy for the Coming soon pages (src/components/shell/coming-soon.tsx),
// keyed by the nav item's href (src/lib/nav.ts). Each entry says what the
// feature will do and what to use in the app until it ships, so a planned
// item in the sidebar is never a dead end. When a feature ships, replace its
// page.tsx with the real screen, drop `soon` from its nav item and delete
// its entry here.

export type ComingSoonCopy = {
  /** One sentence: the job this screen will do. */
  summary: string;
  /** What it will let people do. */
  points: string[];
  /** Existing screens that cover the need today. */
  meanwhile: { href: string; label: string; detail: string }[];
};

// Every planned sidebar item has shipped; add an entry here (and `soon: true`
// on its nav item) for the next one.
export const COMING_SOON: Record<string, ComingSoonCopy> = {};
