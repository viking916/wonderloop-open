import type { HTMLAttributes, ReactNode } from "react";

export interface HeaderProps extends Omit<HTMLAttributes<HTMLElement>, "className"> {
  /** Display name for the signed-in profile, e.g. "Explorer". */
  userName: string;
  /** One or two letter initials shown in the avatar. */
  initials: string;
  rightSlot?: ReactNode;
  className?: string;
}

function CompassMark() {
  return (
    <svg viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
      <path d="M13 3.5a9.5 9.5 0 1 1-8.2 4.7" />
      <path d="M3.2 3.6l1.6 4.6 4.6-1.6" />
    </svg>
  );
}

/** The forest-green top bar: brand mark, wordmark, and the signed-in profile. */
export function Header({ userName, initials, rightSlot, className, ...rest }: HeaderProps) {
  const classes = ["tr-header", className ?? ""].filter(Boolean).join(" ");

  return (
    <header className={classes} {...rest}>
      <div className="tr-header__brand">
        <CompassMark />
        Wonderloop
      </div>
      <div className="tr-header__who">
        <span>{userName}</span>
        <div className="tr-header__avatar" aria-hidden="true">
          {initials}
        </div>
        {rightSlot}
      </div>
    </header>
  );
}
