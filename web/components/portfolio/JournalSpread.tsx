"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { Stamp } from "@/components/ui/Stamp";
import { MAKER_PROMPTS, PLAY_PROMPTS, SPEAK_PROMPTS } from "@/components/quest/LogStep";
import { getStorageBucket } from "@/lib/firebase/client";
import { TRACK_LABEL, type Quest } from "@/lib/content/schema";
import type { ArtifactDoc, LogDoc } from "@/lib/data/types";

export type JournalSpreadProps = {
  quest: Quest;
  /** When this quest reached "done" (spec 7.2's questStatus); undefined only for a not-yet-done
   * quest, which the portfolio never actually passes in (see app/explorer/portfolio/page.tsx). */
  completedAt?: number;
  artifact?: { id: string; artifact: ArtifactDoc };
  log?: { id: string; log: LogDoc };
  /** Fallback content for a quest with no artifact step at all (Think, completion "all-steps"):
   * its written explain-it submissions, the closest thing Think has to an artifact. */
  explainEntries?: { title: string; text: string }[];
  /** A data step's question, answer and rows (app/explorer/portfolio/page.tsx dataEntriesFor). */
  dataEntries?: { title: string; text: string }[];
  /** True when this quest's artifact step was finished by marking the recording made
   * (components/quest/ArtifactStep.tsx). There is no artifact doc and no file for that: the
   * recording is on the family's phone. Says so, rather than falling back to "No artifact
   * recorded for this quest" on a quest he did record and did finish. */
  recordingOnPhone?: boolean;
};

function stampLabel(at: number | undefined): string {
  if (!at) return "done";
  return `done\n${new Date(at).toLocaleDateString(undefined, { weekday: "short" }).toLowerCase()}`;
}

/**
 * Fetches a text/code artifact's stored content back from Storage. Unlike
 * components/quest/ArtifactStep.tsx (which only echoes back what was just saved in the same
 * session, since a Build/Speak step in progress has nowhere else to read it from), the
 * portfolio is exactly the "read it back after the fact" screen, so it always re-fetches from
 * the artifact's own storagePath.
 */
function useTextArtifact(artifact: ArtifactDoc | undefined): string | undefined {
  const [text, setText] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    // The reset-then-fetch runs inside this nested function, not directly in the effect body,
    // so every setText call here is "a callback function when external state changes" (the
    // pattern react-hooks/set-state-in-effect asks for), never a synchronous effect-body call.
    async function load() {
      if (!artifact || (artifact.kind !== "code" && artifact.kind !== "text" && artifact.kind !== "transcript")) {
        if (!cancelled) setText(undefined);
        return;
      }
      try {
        const url = await getDownloadURL(storageRef(getStorageBucket(), artifact.storagePath));
        const res = await fetch(url);
        const body = await res.text();
        if (!cancelled) setText(body);
      } catch {
        if (!cancelled) setText(undefined);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [artifact]);

  return text;
}

/**
 * True once the code block's own content is actually wider than its box (task 12 fold-in fix).
 * Drives the right-edge fade in globals.css's `.tr-spread__code--overflow`: a snippet that
 * already fits must never fade its last character, which would falsely promise more is hiding
 * past it. Re-checked whenever the box resizes (a portfolio pane narrowing, a font loading in)
 * via ResizeObserver, not just once on mount.
 */
function useHorizontalOverflow(text: string | undefined): [RefObject<HTMLPreElement | null>, boolean] {
  const ref = useRef<HTMLPreElement | null>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  return [ref, overflows];
}

/** A download URL for a photo or a recording; undefined for text kinds and while loading. */
function useMediaUrl(artifact: ArtifactDoc | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!artifact || (artifact.kind !== "photo" && artifact.kind !== "recording")) {
        if (!cancelled) setUrl(undefined);
        return;
      }
      try {
        const u = await getDownloadURL(storageRef(getStorageBucket(), artifact.storagePath));
        if (!cancelled) setUrl(u);
      } catch {
        if (!cancelled) setUrl(undefined);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [artifact]);

  return url;
}

/**
 * One field-journal spread (the design demo's "Screen 3, Portfolio"): the artifact on the left
 * page, the Maker's Log or Speak log on the right, stamped and dated. Renders exactly what the
 * quest actually produced -- a Think quest (no artifact step, no log step) falls back to its
 * written explain-its on the left and a plain note on the right, rather than a Build/Speak
 * layout with nothing real to show.
 */
export function JournalSpread({ quest, completedAt, artifact, log, explainEntries, dataEntries, recordingOnPhone }: JournalSpreadProps) {
  const scienceMoment = quest.steps.find((s) => s.kind === "science")?.body;
  const logStep = quest.steps.find((s) => s.kind === "log");
  const prompts = logStep?.variant === "speak" ? SPEAK_PROMPTS : logStep?.variant === "play" ? PLAY_PROMPTS : MAKER_PROMPTS;

  const photoUrl = useMediaUrl(artifact?.artifact);
  const textContent = useTextArtifact(artifact?.artifact);
  const [codeRef, codeOverflows] = useHorizontalOverflow(textContent);

  return (
    <div className="tr-spread-wrap">
      <p className="tr-eyebrow tr-spread__eyebrow">
        Field journal · Week {quest.week} · {TRACK_LABEL[quest.track]}
      </p>
      <div className="tr-spread">
        <Stamp label={stampLabel(completedAt)} size="lg" />
        <div className="tr-spread__page">
          <h3>{quest.title}</h3>
          {artifact ? (
            <>
              {artifact.artifact.kind === "photo" ? (
                photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a Storage-hosted photo, not a static asset Next can optimize
                  <img className="tr-spread__photo" src={photoUrl} alt={`Photo from ${quest.title}`} />
                ) : (
                  <p className="tr-spread__cap">Loading photo...</p>
                )
              ) : null}
              {artifact.artifact.kind === "code" ? (
                <pre
                  ref={codeRef}
                  className={`tr-spread__code${codeOverflows ? " tr-spread__code--overflow" : ""}`}
                  tabIndex={0}
                  aria-label="Code artifact, scrolls sideways for lines wider than the page"
                >
                  <code>{textContent ?? "Loading code..."}</code>
                </pre>
              ) : null}
              {artifact.artifact.kind === "text" || artifact.artifact.kind === "transcript" ? (
                <p className="tr-spread__text">{textContent ?? "Loading..."}</p>
              ) : null}
              {artifact.artifact.kind === "recording" ? (
                photoUrl ? (
                  artifact.artifact.contentType?.startsWith("audio/") ? (
                    <audio className="tr-spread__audio" controls src={photoUrl} aria-label={`Recording from ${quest.title}`} />
                  ) : (
                    <video className="tr-spread__video" controls playsInline src={photoUrl} aria-label={`Recording from ${quest.title}`} />
                  )
                ) : (
                  <p className="tr-spread__cap">Loading recording...</p>
                )
              ) : null}
            </>
          ) : recordingOnPhone ? (
            <p className="tr-spread__cap">You recorded this one and kept the file outside the app.</p>
          ) : explainEntries && explainEntries.length > 0 ? (
            explainEntries.map((entry, i) => (
              <div key={i}>
                <p className="tr-spread__cap">{entry.title}</p>
                <p className="tr-spread__text">{entry.text}</p>
              </div>
            ))
          ) : (
            <p className="tr-spread__cap">No artifact recorded for this quest.</p>
          )}
          {dataEntries?.map((entry, i) => (
            <div key={`data-${i}`}>
              <p className="tr-spread__cap">The numbers: {entry.title}</p>
              <p className="tr-spread__text">{entry.text}</p>
            </div>
          ))}
          {scienceMoment ? <p className="tr-spread__cap">Science moment: {scienceMoment}</p> : null}
        </div>
        <div className="tr-spread__page">
          <h3>{logStep?.variant === "speak" ? "Speak log" : logStep?.variant === "play" ? "Practice log" : "Maker's Log"}</h3>
          {log ? (
            <dl className="tr-spread__log">
              {prompts.map((prompt, i) =>
                log.log.answers[i] ? (
                  <div key={prompt}>
                    <dt>{prompt}</dt>
                    <dd>{log.log.answers[i]}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          ) : (
            <p className="tr-spread__cap">
              {quest.track === "think" ? "Think quests have no Maker's Log." : "No log recorded for this quest."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
