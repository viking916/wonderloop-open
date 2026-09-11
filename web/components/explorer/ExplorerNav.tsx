/** "quest" is a screen inside This Week: every link is a real way out, none reads as current. */
export type ExplorerNavPage = "week" | "ladder" | "portfolio" | "skills" | "quest";

const LINKS: { page: ExplorerNavPage; href: string; label: string }[] = [
  { page: "week", href: "/explorer", label: "This week" },
  { page: "ladder", href: "/explorer/ladder", label: "Ladder" },
  { page: "portfolio", href: "/explorer/portfolio", label: "Portfolio" },
  { page: "skills", href: "/explorer/skills", label: "Skills map" },
];

export interface ExplorerNavProps {
  /** The page this nav renders on, so its own link reads as "you are here" rather than as
   * another place to click. */
  current: ExplorerNavPage;
}

/**
 * The Header's cross-screen nav (spec: Portfolio and the skills map must be "reachable without
 * typing a URL"), shown in the Header's dark forest rightSlot alongside SwitchProfileButton on
 * every signed-in Explorer screen. Plain underlined links, not the tr-btn chrome
 * SwitchProfileButton uses, so four controls in one bar reads as one wayfinding row rather than
 * a wall of buttons.
 */
export function ExplorerNav({ current }: ExplorerNavProps) {
  return (
    <nav className="tr-header__nav" aria-label="Explorer sections">
      {LINKS.map((link) =>
        link.page === current ? (
          <span key={link.page} aria-current="page">
            {link.label}
          </span>
        ) : (
          <a key={link.page} href={link.href}>
            {link.label}
          </a>
        ),
      )}
    </nav>
  );
}
