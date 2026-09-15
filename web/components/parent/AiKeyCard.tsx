"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { getClientAuth } from "@/lib/firebase/client";
import type { KeyStatusResponse } from "@/app/api/ai/key/route";

async function callKeyRoute(method: "GET" | "POST" | "DELETE", hid: string, key?: string): Promise<KeyStatusResponse> {
  const user = getClientAuth().currentUser;
  const token = user ? await user.getIdToken() : "";
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  let res: Response;
  try {
    if (method === "POST") {
      headers["content-type"] = "application/json";
      res = await fetch("/api/ai/key", { method, headers, body: JSON.stringify({ hid, key }) });
    } else {
      res = await fetch(`/api/ai/key?hid=${encodeURIComponent(hid)}`, { method, headers });
    }
    return (await res.json()) as KeyStatusResponse;
  } catch {
    return { ok: false, message: "Could not reach the app. Check your connection and try again." };
  }
}

/**
 * Where a family switches the AI features on (owner decision, 6 September 2026): the debate
 * room's opponent and coach run on the family's own Anthropic key, stored server-side and
 * never shown again. Without a key those features stay off and every quest still completes
 * (the debate room offers "we debated it out loud" instead).
 */
export function AiKeyCard({ householdId }: { householdId: string }) {
  const [status, setStatus] = useState<{ configured: boolean; last4?: string } | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [tone, setTone] = useState<"ok" | "problem">("ok");

  useEffect(() => {
    let cancelled = false;
    callKeyRoute("GET", householdId).then((res) => {
      if (cancelled) return;
      setStatus(res.ok ? { configured: res.configured, last4: res.last4 } : { configured: false });
    });
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  async function save() {
    if (!draft.trim()) return;
    setBusy(true);
    setMessage(undefined);
    const res = await callKeyRoute("POST", householdId, draft.trim());
    if (res.ok) {
      setStatus({ configured: res.configured, last4: res.last4 });
      setDraft("");
      setTone("ok");
      setMessage("Key checked and saved. The debate room is on for this family.");
    } else {
      setTone("problem");
      setMessage(res.message);
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    setMessage(undefined);
    const res = await callKeyRoute("DELETE", householdId);
    if (res.ok) {
      setStatus({ configured: false });
      setTone("ok");
      setMessage("Key removed. AI features are off until a new one is added.");
    } else {
      setTone("problem");
      setMessage(res.message);
    }
    setBusy(false);
  }

  return (
    <Card tone="surface" shadow className="pr-aikey" aria-labelledby="aikey-heading">
      <p className="tr-eyebrow" id="aikey-heading">
        AI features
      </p>
      <p className="pr-aikey__lede">
        The debate room&rsquo;s opponent and coach run on your own Anthropic key, so the cost lands on your account and
        nobody else&rsquo;s. A full three-round debate is about five short calls. Get a key at console.anthropic.com,
        paste it here, and it is checked once and kept on the server. It is never shown again.
      </p>
      {status === undefined ? (
        <p className="tr-step__note">Checking...</p>
      ) : status.configured ? (
        <div className="pr-aikey__status">
          <Chip tone="positive">On</Chip>
          <span>Key ending in {status.last4 ?? "????"} is set for this family.</span>
          <Button variant="quiet" onClick={() => void remove()} disabled={busy}>
            Remove key
          </Button>
        </div>
      ) : (
        <div className="pr-aikey__status">
          <Chip>Off</Chip>
          <span>No key yet. Debates can still be held out loud with a grown-up.</span>
        </div>
      )}
      <div className="pr-aikey__form">
        <label className="tr-working__label" htmlFor="aikey-input">
          {status?.configured ? "Replace the key" : "Anthropic key"}
        </label>
        <input
          id="aikey-input"
          className="tr-input"
          type="password"
          autoComplete="off"
          placeholder="sk-ant-..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy}
        />
        <div className="tr-step__actions">
          <Button variant="primary" onClick={() => void save()} disabled={busy || !draft.trim()}>
            {busy ? "Checking..." : "Check and save"}
          </Button>
        </div>
      </div>
      {message ? (
        <p role={tone === "problem" ? "alert" : undefined} className={tone === "problem" ? "pr-confirm__error" : "tr-step__done"}>
          {message}
        </p>
      ) : null}
    </Card>
  );
}
