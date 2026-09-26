"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { getLadderGraph, getLadderTopic } from "@/lib/content/app-content";
import { STAGE_TITLES, projectSessions, retrievalDue, stageSummary, type LadderState, type SkillRetrieval, type TopicState } from "@/lib/domain/ladder";
import { type SessionDoc, watchLadderState, watchRetrieval, watchSessions, watchTopicStates } from "@/lib/data/ladder";

/**
 * The parent's Ladder card (polish pass, 15 September 2026: the old full topic-pill map, about
 * 150 pills, read as a wall of text, and unauthored topics -- the whole Calculus stage, parked
 * per docs/AGENT-GUIDE.md section 7 -- were fought down to a fading grey well under the 4.5:1
 * text-contrast floor). The default view is now six rows, one per spine stage, sharing
 * lib/domain/ladder.ts's stageSummary with the Explorer's own This Week card so the two screens
 * can never drift on what "n of m mastered" or "current stage" means: sessions and hours, the
 * projection from recent pace, and the decay risks (skills overdue with lapses) stay above it.
 * No grade labels; stage names only, which is what the owner reads progress against. The full
 * topic-by-topic list still exists, behind a native <details> a parent opens on purpose, with
 * every pill's text at full contrast -- an unauthored topic says "Not open yet" in words rather
 * than fading its real title.
 */
export function LadderCard({ householdId, profileId, name }: { householdId: string; profileId: string; name: string }) {
  const graph = useMemo(() => getLadderGraph(), []);
  const [state, setState] = useState<LadderState | undefined>(undefined);
  const [topics, setTopics] = useState<Record<string, TopicState>>({});
  const [retrieval, setRetrieval] = useState<SkillRetrieval[]>([]);
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  useEffect(() => watchLadderState(householdId, profileId, setState), [householdId, profileId]);
  useEffect(() => watchTopicStates(householdId, profileId, setTopics), [householdId, profileId]);
  useEffect(() => watchRetrieval(householdId, profileId, setRetrieval), [householdId, profileId]);
  useEffect(() => watchSessions(householdId, profileId, setSessions), [householdId, profileId]);

  if (graph.length === 0) return null;
  const stages = stageSummary(graph, topics, state?.currentTopic);
  const mastered = graph.filter((t) => topics[t.id]?.state === "mastered").length;
  const recent = sessions.slice(-4);
  const hours = sessions.reduce((n, s) => n + (s.minutes ?? 0), 0) / 60;
  const masteredInRecent = graph.filter((t) => { const ms = topics[t.id]?.masteredSession; return ms !== undefined && recent.some((s) => s.number === ms); }).length;
  const pace = recent.length ? masteredInRecent / recent.length : 0;
  const currentStage = graph.find((t) => t.id === state?.currentTopic)?.stage;
  const leftInStage = currentStage ? graph.filter((t) => t.stage === currentStage && topics[t.id]?.state !== "mastered").length : 0;
  const projected = projectSessions(leftInStage, pace);
  const session = state?.sessionCount ?? 0;
  const overdue = retrievalDue(retrieval, session + 1).filter((e) => e.lapses > 0);

  return (
    <Card tone="surface" className="pr-ladder" aria-labelledby={`ladder-${profileId}`}>
      <p className="tr-eyebrow" id={`ladder-${profileId}`}>The Ladder</p>
      {!state ? (
        <p className="pr-ladder__intro">{name} has not started the Ladder. It opens from the Explorer&apos;s nav; the first session is placement.</p>
      ) : (
        <>
          <p className="pr-ladder__facts">
            {session} session{session === 1 ? "" : "s"}{hours >= 0.5 ? `, about ${hours.toFixed(1)} hours` : ""}. {mastered} of {graph.length} topics mastered.
            {state.placementDone ? "" : " Placement in progress."}
            {state.currentTopic ? ` Now on ${graph.find((t) => t.id === state.currentTopic)?.title ?? state.currentTopic}.` : ""}
          </p>
          {currentStage && projected !== undefined ? (
            <p className="pr-ladder__projection">At the last four sessions&apos; pace, {STAGE_TITLES[currentStage] ?? `stage ${currentStage}`} finishes in about {projected} more session{projected === 1 ? "" : "s"}.</p>
          ) : currentStage ? (
            <p className="pr-ladder__projection">No topic mastered in the last four sessions yet, so no projection.</p>
          ) : null}
          {overdue.length ? (
            <p className="pr-ladder__risk">Decay risk: {overdue.map((e) => e.skillId.replace("think.skills.", "")).join(", ")} overdue after a miss.</p>
          ) : null}
        </>
      )}

      <div className="pr-ladder__stages">
        {stages.map((s) => (
          <div key={s.stage} className="pr-ladder__stagerow">
            <div className="pr-ladder__stagerow-head">
              <span className="pr-ladder__stagerow-name">{s.title}</span>
              {s.status === "current" ? <Chip tone="progress">You are here</Chip> : null}
            </div>
            <p className="tr-meta">{s.mastered} of {s.total} topics mastered</p>
            <ProgressBar
              value={s.total > 0 ? (s.mastered / s.total) * 100 : 0}
              tone={s.status === "mastered" ? "moss" : "blaze"}
              label={`${s.title}: ${s.mastered} of ${s.total} topics mastered`}
            />
          </div>
        ))}
      </div>

      <details className="pr-ladder__details">
        <summary>See every topic</summary>
        <div className="pr-ladder__map">
          {stages.map((s) => (
            <div key={s.stage} className="pr-ladder__stage">
              <span className="pr-ladder__stage-name">{s.title}</span>
              <span className="pr-ladder__chips">
                {graph.filter((t) => t.stage === s.stage).map((t) => {
                  const topicStatus = topics[t.id]?.state ?? "unplaced";
                  const authored = Boolean(getLadderTopic(t.id));
                  return (
                    <span
                      key={t.id}
                      className={`pr-ladder__chip pr-ladder__chip--${topicStatus}${authored ? "" : " pr-ladder__chip--not-open"}${state?.currentTopic === t.id ? " pr-ladder__chip--now" : ""}`}
                      title={authored ? `${t.title}: ${topicStatus}` : `${t.title}: not yet authored`}
                    >
                      {authored ? t.title : "Not open yet"}
                    </span>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}
