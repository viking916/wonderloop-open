"use client";

export type ToastTone = "info" | "success" | "hint";

export interface ToastProps {
  message: string;
  tone?: ToastTone;
  onDismiss?: () => void;
  className?: string;
}

/** A small inline notice: forest for info, moss for success, sun for a hint. */
export function Toast({ message, tone = "info", onDismiss, className }: ToastProps) {
  const classes = [
    "tr-toast",
    tone !== "info" ? `tr-toast--${tone}` : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} role="status">
      <p className="tr-toast__message">{message}</p>
      {onDismiss ? (
        <button type="button" className="tr-toast__dismiss" onClick={onDismiss} aria-label="Dismiss">
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
