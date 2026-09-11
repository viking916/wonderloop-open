"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export type InviteCardProps = {
  householdName: string;
  inviteCode: string;
};

/**
 * The household invite card (spec 7.1 screen 8, task 13 brief: "the household invite code with
 * a copy button. Accepting an invite is a later plan; say so plainly on the card rather than
 * offering a control that does nothing"). lib/data/households.ts's joinByCode exists but is not
 * reachable by a signed-in member through the client SDK yet (its own doc comment: firestore
 * .rules only lets an existing member read/write a household, so a non-member cannot join
 * through this code path -- that needs a server-side join route, Plan 4's work). This card only
 * ever shows and copies the code; it never offers a "join" control of its own.
 */
export function InviteCard({ householdName, inviteCode }: InviteCardProps) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied or unavailable: the code is still shown on screen to copy
      // by hand, so this failure needs no user-facing error.
    }
  }

  return (
    <Card tone="kraft" className="pr-invite" aria-labelledby="invite-card-heading">
      <p className="tr-eyebrow" id="invite-card-heading">
        Household invite
      </p>
      <h3>{householdName}</h3>
      <div className="pr-invite__code-row">
        <code className="pr-invite__code">{inviteCode}</code>
        <Button variant="secondary" onClick={() => void copyCode()}>
          {copied ? "Copied" : "Copy code"}
        </Button>
      </div>
      <p className="pr-invite__note">
        Share this code with another parent to add them to this household. Accepting an invite
        with this code is not built yet; it arrives in a later release.
      </p>
    </Card>
  );
}
