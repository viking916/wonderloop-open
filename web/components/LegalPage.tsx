import Link from "next/link";
import type { ReactNode } from "react";

/** The frame for the privacy notice and the terms of use: plain prose, a way back, no session needed. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="tr-legal">
      <p className="tr-eyebrow">Wonderloop</p>
      <h1 className="tr-legal__title">{title}</h1>
      <p className="tr-legal__updated">Last updated {updated}.</p>
      <div className="tr-legal__body">{children}</div>
      <p className="tr-legal__foot">
        <Link href="/">Back to Wonderloop</Link> · <a href="/privacy">Privacy notice</a> · <a href="/terms">Terms of use</a>
      </p>
    </main>
  );
}
