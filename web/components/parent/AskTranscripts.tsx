"use client";

import { Card } from "@/components/ui/Card";
import { getQuest } from "@/lib/content/app-content";
import { TRACK_LABEL } from "@/lib/content/schema";
import type { TutorChatDoc } from "@/lib/data/types";
import type { Profile } from "@/lib/session";

export type AskTranscriptsProps = {
  profile: Profile;
  chats: Array<{ id: string; chat: TutorChatDoc }>;
};

function whenLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function trimPrompt(prompt: string): string {
  return prompt.length > 80 ? `${prompt.slice(0, 80).trimEnd()}...` : prompt;
}

/**
 * Every "Ask" chat this child has had (owner-approved 12 September 2026: a grown-up can read it
 * later). The 20 newest, each a collapsed disclosure so the list stays short -- watchTutorChats
 * already orders newest first, so this only needs to cap the length. Nothing here is scored.
 *
 * Since 25 September 2026 (A4, Build and Make Ask) the same list also carries step chats
 * (chat.kind === "step", lib/domain/builderAsk.ts): a chat from ProblemPlayer's own Ask is
 * labelled by quest and the problem it prompted; a Builder Ask chat is labelled by quest and
 * track/step instead, since it was never asked on a problem at all.
 */
export function AskTranscripts({ profile, chats }: AskTranscriptsProps) {
  const recent = chats.slice(0, 20);
  return (
    <Card tone="surface" className="pr-ask" aria-labelledby={`ask-${profile.id}`}>
      <p className="tr-eyebrow" id={`ask-${profile.id}`}>
        Ask transcripts
      </p>
      {recent.length === 0 ? (
        <p className="pr-ask__empty">No asks yet.</p>
      ) : (
        <ul className="pr-ask__list">
          {recent.map(({ id, chat }) => {
            const quest = getQuest(chat.questId);
            const isStepChat = chat.kind === "step";
            const metaLabel = isStepChat
              ? `${quest ? TRACK_LABEL[quest.track] : ""} step: ${trimPrompt(chat.prompt)}`.trim()
              : trimPrompt(chat.prompt);
            return (
              <li key={id} className="pr-ask__item">
                <div className="pr-ask__head">
                  <span className="pr-ask__quest">{quest?.title ?? chat.questId}</span>
                  <span className="pr-ask__meta">
                    {metaLabel}, {whenLabel(chat.updatedAt)}
                  </span>
                </div>
                <details className="pr-ask__details">
                  <summary>Read the whole exchange</summary>
                  <div className="pr-ask__log">
                    {chat.messages.map((m, i) => (
                      <p key={i} className={`pr-ask__turn pr-ask__turn--${m.role}`}>
                        <strong>{m.role === "child" ? profile.name : "Ask"}:</strong> {m.text}
                      </p>
                    ))}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
