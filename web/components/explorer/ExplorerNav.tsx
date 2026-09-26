import Link from "next/link";

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
 * every signed-in Explorer screen. Plain Source Sans links, not the tr-btn chrome
 * SwitchProfileButton uses, so four controls in one bar reads as one wayfinding row rather than
 * a wall of buttons. The current page is marked by aria-current, which app/globals.css turns into
 * bold white text with a 3px sun-coloured bar underneath (polish pass, 15 September 2026: this
 * used to be Courier Prime with an underline, a typewriter style that read as unfinished next to
 * the bold Switch profile button beside it).
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
          // next/link, not a plain <a>: a full page load here tore down the page before React
          // could ever paint RouteProgressBar's own pending state (see that file's doc comment
          // and Button.tsx's isClientRoute for the full story). data-tr-nav="client" is the same
          // marker Button.tsx sets, so the shared bar knows this is a client transition and keeps
          // its ordinary delayed timing instead of the immediate hard-navigation fallback.
          <Link key={link.page} href={link.href} data-tr-nav="client">
            {link.label}
          </Link>
        ),
      )}
    </nav>
  );
}
