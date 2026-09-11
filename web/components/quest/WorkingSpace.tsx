"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getWorking, saveWorking } from "@/lib/data/workings";
import type { Stroke, WorkingDoc } from "@/lib/data/types";
import { PenCanvas, type PenTool } from "./PenCanvas";

export type WorkingContent = { text: string; strokes: Stroke[] };

export type WorkingSpaceProps = {
  householdId: string;
  profileId: string;
  problemId: string;
  /**
   * Fires once hydration resolves (undefined if he has never opened or written anything on this
   * problem), and again on every real edit after that. ProblemPlayer listens to this to decide
   * the try-3 "what did you try" gate's copy and to freeze a "last time" snapshot for the
   * mistake-box return -- this component owns its own fetch/save entirely and needs nothing
   * back from that caller to do its own job.
   */
  onContentChange?: (content: WorkingContent | undefined) => void;
  /**
   * When false (the default), the Firestore read that hydrates this problem's working is
   * deferred until the panel is actually opened -- the overwhelming majority of problems shown
   * across a whole session are never opened at all, so no read happens for them. Set true by a
   * caller that needs to know the content before he has clicked anything: ProblemPlayer passes
   * true in mistake-box review (the "last time" block needs it immediately, unopened) and once
   * the try-3 gate is imminent (view.triesUsed >= 2), never for an ordinary, freshly-shown
   * problem. This is a real, measured fix, not speculative tidiness: an earlier version fetched
   * unconditionally on every mount, and the added Firestore chatter across a fast sweep through
   * many problems (scripts/verify-ui.mjs's interaction sweep) was reproducibly slow enough,
   * often enough, to blow past that sweep's busy-clearing wait and flake its coverage check --
   * see task 43's report for the reproduction.
   */
  eagerLoad?: boolean;
};

/** How long to wait, quiet, after the last keystroke or stroke before actually writing --
 * "zero ceremony: no save button, auto-saved" (task brief), not "a write on every keystroke". */
const SAVE_DEBOUNCE_MS = 500;

/**
 * The working space (task 43): one quiet button on the problem player that opens a small panel
 * with a typed area and a pen canvas, scoped to one problem id
 * (households/{hid}/profiles/{pid}/workings/{problemId}). Never required, never graded, never
 * touches an attempt, a skill or the mistake box -- see lib/data/types.ts's WorkingDoc doc
 * comment.
 *
 * Nothing is written for a problem he only opens and never touches: `getWorking` on mount
 * hydrates the panel from whatever already exists (or nothing, silently), and every write below
 * originates from an actual edit handler (handleTextChange/handleStrokesChange/handleClear),
 * never from that hydration itself -- a problem merely viewed leaves no working document behind
 * at all.
 */
export function WorkingSpace({ householdId, profileId, problemId, onContentChange, eagerLoad = false }: WorkingSpaceProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<PenTool>("pen");

  const pendingRef = useRef<WorkingContent | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ProblemPlayer.tsx mounts this with key={problem.id}, so in practice a fresh problem is
  // always a fresh instance already. This still resets explicitly (React's "adjust state during
  // render" pattern, comparing against the previous render's own identity, the same pattern
  // ProblemPlayer.tsx itself uses for its prevProblemId) so a caller that reuses one instance
  // across a changing problemId -- without that key -- gets a correct reset (loaded back to
  // false, so the effect below actually re-fetches) rather than silently keeping the PREVIOUS
  // problem's hydrated content and never fetching the new one's. Only state is touched here
  // (never a ref -- refs may not be read or written during render); the identity-keyed effect
  // below already flushes/clears pendingRef and saveTimerRef in its own cleanup the moment
  // householdId/profileId/problemId change, which covers the same "leaving the old problem
  // behind" moment this reset does for state.
  const identityKey = `${householdId}|${profileId}|${problemId}`;
  const [prevIdentityKey, setPrevIdentityKey] = useState(identityKey);
  if (identityKey !== prevIdentityKey) {
    setPrevIdentityKey(identityKey);
    setOpen(false);
    setLoaded(false);
    setText("");
    setStrokes([]);
  }

  // This effect's one job is fetch, and it only does that once there is an actual reason to:
  // eagerLoad true (see that prop's own comment), or he has opened the panel himself. The
  // `loaded` guard keeps it from re-fetching a second time if open flips true again after the
  // panel was already hydrated once, or after eagerLoad flips true post-hydration.
  const shouldHydrate = eagerLoad || open;
  useEffect(() => {
    if (!shouldHydrate || loaded) return;
    let cancelled = false;
    void getWorking(householdId, profileId, problemId).then((w: WorkingDoc | undefined) => {
      if (cancelled) return;
      setText(w?.text ?? "");
      setStrokes(w?.strokes ?? []);
      setLoaded(true);
      onContentChange?.(w ? { text: w.text, strokes: w.strokes } : undefined);
    });
    return () => {
      cancelled = true;
    };
    // onContentChange deliberately excluded: ProblemPlayer.tsx passes a plain function, recreated
    // on every one of its renders (including its own once-a-second tick), not a useCallback-
    // memoized one -- including it here would re-fetch on every unrelated parent render instead
    // of only when the problem actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldHydrate, loaded, householdId, profileId, problemId]);

  // Flushes any not-yet-saved edit the moment the identity changes (moving to a different
  // problem, without ProblemPlayer's own key remounting this) or this unmounts entirely
  // (leaving the player). The debounced write scheduled in `commit` below already covers the
  // ordinary "paused for half a second" case; this covers what it cannot -- moving on in less
  // than SAVE_DEBOUNCE_MS, where a plain cleanup that only cleared the timer would silently
  // drop the very last edit. This is also the only place pendingRef/saveTimerRef are ever
  // cleared for the OLD identity -- refs may not be touched during render, so the state reset
  // above (the identityKey block) deliberately leaves them to this effect's cleanup instead.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (pendingRef.current) {
        void saveWorking(householdId, profileId, problemId, pendingRef.current);
        pendingRef.current = null;
      }
    };
  }, [householdId, profileId, problemId]);

  function commit(next: WorkingContent) {
    pendingRef.current = next;
    onContentChange?.(next);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const data = pendingRef.current;
      pendingRef.current = null;
      if (data) void saveWorking(householdId, profileId, problemId, data);
    }, SAVE_DEBOUNCE_MS);
  }

  function handleTextChange(nextText: string) {
    setText(nextText);
    commit({ text: nextText, strokes });
  }
  function handleStrokesChange(nextStrokes: Stroke[]) {
    setStrokes(nextStrokes);
    setCleared(undefined);
    commit({ text, strokes: nextStrokes });
  }
  // Clear keeps what it wiped until the next stroke, so a stray tap on a small toolbar button
  // costs nothing: the same button turns into "Undo clear" (docs/ui-styleguide.md section 1,
  // a stray tap never loses work). Drawing again forgets the cleared strokes for good.
  const [cleared, setCleared] = useState<Stroke[] | undefined>(undefined);
  function handleClear() {
    setCleared(strokes);
    setStrokes([]);
    commit({ text, strokes: [] });
  }
  function handleUndoClear() {
    if (!cleared) return;
    setStrokes(cleared);
    setCleared(undefined);
    commit({ text, strokes: cleared });
  }

  return (
    <div className="tr-working">
      <Button variant="quiet" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? "Close working space" : "Working space"}
      </Button>
      {open ? (
        <div className="tr-working__panel">
          {!loaded ? (
            <p className="tr-working__loading">Getting your working space ready…</p>
          ) : (
            <>
              <p className="tr-working__hint">Work it out here. Nobody grades this. It saves by itself.</p>
              <div className="tr-working__toolbar">
                <Button
                  variant={tool === "pen" ? "secondary" : "quiet"}
                  onClick={() => setTool("pen")}
                  aria-pressed={tool === "pen"}
                >
                  Pen
                </Button>
                <Button
                  variant={tool === "eraser" ? "secondary" : "quiet"}
                  onClick={() => setTool("eraser")}
                  aria-pressed={tool === "eraser"}
                >
                  Eraser
                </Button>
                {cleared && strokes.length === 0 ? (
                  <Button variant="quiet" onClick={handleUndoClear}>
                    Undo clear
                  </Button>
                ) : (
                  <Button variant="quiet" onClick={handleClear} disabled={strokes.length === 0}>
                    Clear
                  </Button>
                )}
              </div>
              <PenCanvas
                strokes={strokes}
                onStrokesChange={handleStrokesChange}
                tool={tool}
                ariaLabel="Your working space drawing area"
              />
              <label htmlFor={`${problemId}-working-text`} className="tr-working__label">
                Notes
              </label>
              <textarea
                id={`${problemId}-working-text`}
                className="tr-working__text"
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="Type your thinking here"
                rows={3}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
