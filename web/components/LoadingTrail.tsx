/** The quiet loading state shown while the session is settling: waiting on Firebase Auth's
 * first callback, waiting on a household bootstrap, or waiting for a redirect effect to fire.
 * Shared by app/page.tsx and RequireProfile so every screen shows the same panel instead of a
 * blank page while status is "loading" (or "signed-out", for the instant before a redirect). */
export function LoadingTrail() {
  return (
    <div className="tr-loading">
      <p className="tr-loading__text">Getting your trail ready…</p>
    </div>
  );
}
