"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/ui/Header";
import { RequireProfile } from "@/components/RequireProfile";
import { SwitchProfileButton } from "@/components/SwitchProfileButton";
import { ExplorerNav } from "@/components/explorer/ExplorerNav";
import { SkillRow } from "@/components/skills/SkillRow";
import { IdeaBox } from "@/components/skills/IdeaBox";
import { getContent } from "@/lib/content/app-content";
import { TRACK_LABEL } from "@/lib/content/schema";
import { tracksForProfile } from "@/lib/domain/tracks";
import { CalibrationCard } from "@/components/skills/CalibrationCard";
import { LoadingTrail } from "@/components/LoadingTrail";
import { levelFor, type SkillProgress } from "@/lib/domain/skills";
import { ideaEventsFromProgress, metIdeas, type IdeaEvent } from "@/lib/domain/ideas";
import { watchAllAttempts, watchSkills, watchProgress } from "@/lib/data/progress";
import type { AttemptDoc, ProgressDoc } from "@/lib/data/types";
import { profileInitials, useSession, type Profile } from "@/lib/session";

// Sprout has its own skills map (spec 7.1 screen 6: "Sprout has its own"); an Explorer profile
// sees Build, Think and Speak, plus Play once a parent has turned that track on (or once any
// Play skill has evidence, so turning the track off later hides nothing already earned).

export default function SkillsPage() {
  return <RequireProfile kind="explorer">{(profile) => <SkillsWithHousehold profile={profile} />}</RequireProfile>;
}

function SkillsWithHousehold({ profile }: { profile: Profile }) {
  const { householdId } = useSession();
  // Invariant: session.tsx never sets status "ready" without a householdId -- a
  // type-narrowing guard, not a real-world fallback (matches app/explorer/page.tsx).
  if (!householdId) return null;
  return <SkillsHome key={`${householdId}:${profile.id}`} profile={profile} householdId={householdId} />;
}

function SkillsHome({ profile, householdId }: { profile: Profile; householdId: string }) {
  const content = useMemo(() => getContent(), []);
  const [skillDocs, setSkillDocs] = useState<SkillProgress[]>([]);
  const [attempts, setAttempts] = useState<Array<{ id: string; attempt: AttemptDoc }>>([]);
  const [progressList, setProgressList] = useState<Array<{ questId: string; progress: ProgressDoc }>>([]);

  // Three streams feed this page, and the idea box is built from two of them. Rendering before
  // all three have delivered once painted an idea box that grew a beat later, which the visual
  // gate saw as a page whose height flickered between runs. The page holds its loading state
  // until each stream's first snapshot is in, so what renders is what the child will see.
  const [loaded, setLoaded] = useState<{ skills: boolean; attempts: boolean; progress: boolean }>({ skills: false, attempts: false, progress: false });
  useEffect(() => {
    const unsubSkills = watchSkills(householdId, profile.id, (list) => {
      setSkillDocs(list);
      setLoaded((prev) => (prev.skills ? prev : { ...prev, skills: true }));
    });
    const unsubAttempts = watchAllAttempts(householdId, profile.id, (list) => {
      setAttempts(list);
      setLoaded((prev) => (prev.attempts ? prev : { ...prev, attempts: true }));
    });
    const unsubProgress = watchProgress(householdId, profile.id, (list) => {
      setProgressList(list);
      setLoaded((prev) => (prev.progress ? prev : { ...prev, progress: true }));
    });
    return () => {
      unsubSkills();
      unsubAttempts();
      unsubProgress();
    };
  }, [householdId, profile.id]);
  const allLoaded = loaded.skills && loaded.attempts && loaded.progress;

  const progressBySkill = useMemo(() => new Map(skillDocs.map((s) => [s.skillId, s] as const)), [skillDocs]);

  const tracksWithSkills = useMemo(() => {
    const hasPlayEvidence = skillDocs.some((s) => s.skillId.startsWith("play."));
    const tracks = tracksForProfile({ playTrack: profile.playTrack || hasPlayEvidence });
    return tracks.map((track) => ({ track, skills: content.skills.filter((s) => s.track === track) }));
  }, [content, profile.playTrack, skillDocs]);

  // Every attempt's ideaIds (lib/data/types.ts's AttemptDoc, written on every submitted try,
  // not only correct ones) becomes one idea-met event; lib/domain/ideas.ts's metIdeas alone
  // decides which ideas that adds up to "met" and in what order.
  // Plus the ideas a ticked science step or extra names (the physics thread).
  const ideaEvents = useMemo<IdeaEvent[]>(
    () => [
      ...attempts.flatMap(({ attempt }) =>
        attempt.ideaIds.map((ideaId) => ({ ideaId, problemId: attempt.problemId, at: attempt.at })),
      ),
      ...ideaEventsFromProgress(content.quests, progressList),
    ],
    [attempts, progressList, content],
  );
  const ideas = useMemo(() => metIdeas(ideaEvents), [ideaEvents]);

  return (
    <div className="flex flex-col flex-1">
      <Header
        userName={profile.name}
        initials={profileInitials(profile.name)}
        rightSlot={
          <>
            <ExplorerNav current="skills" />
            <SwitchProfileButton />
          </>
        }
      />
      <main className="mx-auto w-full max-w-[1080px] px-4 py-6 sm:px-6">
        {!allLoaded ? <LoadingTrail /> : null}
        {allLoaded ? <CalibrationCard attempts={attempts.map(({ attempt }) => attempt)} /> : null}
        {allLoaded ? <Card tone="surface" shadow className="!p-0">
          {tracksWithSkills.map(({ track, skills }) => (
            <section key={track} className="tr-skill-track" aria-labelledby={`skill-track-${track}`}>
              <h2 id={`skill-track-${track}`}>{TRACK_LABEL[track]}</h2>
              <div className="tr-skill-rows">
                {skills.map((skill) => (
                  <SkillRow
                    key={skill.id}
                    skill={skill}
                    progress={progressBySkill.get(skill.id) ?? { skillId: skill.id, points: 0, level: levelFor(0), evidence: [], source: "app" }}
                  />
                ))}
              </div>
            </section>
          ))}
          <IdeaBox ideas={ideas} />
        </Card> : null}
      </main>
    </div>
  );
}
