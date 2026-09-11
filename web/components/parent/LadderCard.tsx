"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { getLadderGraph, getLadderTopic } from "@/lib/content/app-content";
import { type LadderState, type SkillRetrieval, type TopicState, projectSessions, retrievalDue } from "@/lib/domain/ladder";
import { type SessionDoc, watchLadderState, watchRetrieval, watchSessions, watchTopicStates } from "@/lib/data/ladder";

const STAGE_NAMES: Record<number, string> = { 1: "Arithmetic", 2: "Prealgebra", 3: "Algebra 1", 4: "Geometry", 5: "Algebra 2 and precalculus", 6: "Calculus" };

/**
 * The parent's Ladder card: the sequence as a map coloured by state, sessions and hours, the
 * projection from recent pace, and the decay risks (skills overdue with lapses). No grade
 * labels; stage names only, which is what the owner reads progress against.
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
  const stages = [...new Set(graph.map((t) => t.stage))].sort((a, b) => a - b);
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
            <p className="pr-ladder__projection">At the last four sessions&apos; pace, {STAGE_NAMES[currentStage] ?? `stage ${currentStage}`} finishes in about {projected} more session{projected === 1 ? "" : "s"}.</p>
          ) : currentStage ? (
            <p className="pr-ladder__projection">No topic mastered in the last four sessions yet, so no projection.</p>
          ) : null}
          {overdue.length ? (
            <p className="pr-ladder__risk">Decay risk: {overdue.map((e) => e.skillId.replace("think.skills.", "")).join(", ")} overdue after a miss.</p>
          ) : null}
        </>
      )}
      <div className="pr-ladder__map">
        {stages.map((stage) => (
          <div key={stage} className="pr-ladder__stage">
            <span className="pr-ladder__stage-name">{STAGE_NAMES[stage] ?? `Stage ${stage}`}</span>
            <span className="pr-ladder__chips">
              {graph.filter((t) => t.stage === stage).map((t) => {
                const s = topics[t.id]?.state ?? "unplaced";
                const authored = Boolean(getLadderTopic(t.id));
                return <span key={t.id} className={`pr-ladder__chip pr-ladder__chip--${s}${authored ? "" : " pr-ladder__chip--unauthored"}${state?.currentTopic === t.id ? " pr-ladder__chip--now" : ""}`} title={`${t.title}: ${s}${authored ? "" : " (not yet authored)"}`}>{t.title}</span>;
              })}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
