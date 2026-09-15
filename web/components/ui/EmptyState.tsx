import type { HTMLAttributes, ReactNode } from "react";

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** A dashed-border placeholder for a track, quest or list with nothing in it yet. */
export function EmptyState({ title, description, icon, action, className, ...rest }: EmptyStateProps) {
  const classes = ["tr-empty", className ?? ""].filter(Boolean).join(" ");

  return (
    <div className={classes} {...rest}>
      {icon ? <div className="tr-empty__icon">{icon}</div> : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
