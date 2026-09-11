"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { Star } from "./Star";
import { ItemGlyph } from "./ItemGlyph";
import { useSpeak } from "./useSpeak";
import type { SproutActivity, SproutItem } from "@/lib/content/schema";
import {
  buildCorrectFeedback,
  buildWrongFeedback,
  checkRound,
  countButtonValues,
  describeItem,
  type SproutResponse,
} from "@/lib/domain/sprout";
import { emptyQuestProgress } from "@/lib/domain/completion";
import { bumpScreenTime, saveQuestProgress } from "@/lib/data/progress";
import { startClock } from "@/lib/data/households";

export type ActivityPlayerProps = {
  activity: SproutActivity;
  householdId: string;
  profileId: string;
};

type Phase = "intro" | "round" | "star" | "offscreen";

// describeItem (the aria-label a parent or a test reads -- spec 6: "no text a child must read",
// but every control still needs a real label) now lives in lib/domain/sprout.ts, shared with the
// spoken-feedback sentence builder below (task 12 brief) so the two can never drift apart.

const SCREEN_TIME_INTERVAL_MS = 60_000;

/** Spec 2: "3 tablet activities of about 5 minutes each." Stored on the activity's progress
 * doc the same way a Quest's own authored `minutes` is (lib/data/progress.ts's buildProgressDoc)
 * -- a fixed, honest label, not a measurement of how long this particular play took (that is
 * screenTime's job, accrued separately and continuously while the activity is open). */
const SPROUT_ACTIVITY_MINUTES = 5;

/**
 * The Sprout activity player (spec 7.1 screen 7 / spec 6): full screen, one round at a time,
 * everything spoken, nothing failable. State machine: intro -> round (repeated) -> star ->
 * offscreen -> back to the hill.
 *
 * Round interaction, per `round.correct.kind` (Plan 1 rulings, plan-2-notes-from-content.md,
 * revised by task 28's real-child finding below):
 * - `pick`: one tap on a card commits it. There is no arm-then-confirm step any more (task 28:
 *   an actual 3-year-old on an iPad tapped the right card, nothing happened, and had no way to
 *   understand why a second tap on the very same spot was needed).
 * - `order`: one tap on a card appends it to the sequence being built (`sp-order-track` shows
 *   the growing sequence so the tap has visible effect immediately); the round auto-checks once
 *   every item has been placed.
 * - `groups`: a tap arms an unplaced card (and replays its sound); a tap on a pile places the
 *   armed card there. Tapping an already-placed card takes it back out, so a mis-sort is always
 *   correctable before the round auto-checks once every card has a pile. This is a genuinely
 *   two-step gesture (pick the card, then pick its pile -- two different targets), not the
 *   same-card-twice pattern task 28 removed from `pick`/`order`, so it is unchanged.
 * - `count`: the items are display-only; the six number buttons commit directly.
 *
 * Re-hearing a card (task 28): some content -- the week 8 path rounds -- was authored on the
 * assumption a child can re-hear each card before choosing (plan-2-notes-from-content.md
 * "Sprout"). With a single tap now committing instead of previewing, that need is met two ways
 * instead of the old per-card double-tap: every `pick`/`order` round speaks its own prompt, then
 * every item's `sound` once in on-screen order, the moment the round opens (see runRoundTour/the
 * phase-"round" effect below) -- so hearing every card needs no tap at all -- and the speaker
 * control at the top of the screen replays that same prompt-then-cards tour on demand, as many
 * times as wanted, for as long as the round stays open. A small per-card speaker icon was
 * considered and rejected: it would ask a 3-year-old's finger to land on a second, smaller target
 * sharing the same card as the one whose tap must stay big and commit-on-touch, exactly the kind
 * of fine-motor precision this app avoids elsewhere. A long press was also considered and
 * rejected per the task brief: it demands sustained, still contact that is a poor fit for a small
 * hand (a wobble reads as a drag/scroll instead), and gives a non-reader no visible cue that
 * holding, rather than tapping, does something different.
 *
 * Task 42 (a real 3-year-old: "voice instructions were said twice quickly and felt overlapping,
 * the clicking flow was not intuitive"): the tour's lines used to be scheduled with
 * `setTimeout(..., speechDurationMs(line))`, guessing how long each line would take. Measured
 * against the real emulator voice, actual playback ran roughly twice that estimate, so every
 * scheduled line started while the one before it was still genuinely speaking, and useSpeak's
 * own cancel()-before-speak cut the first line off mid-word right as the next one began --
 * audibly, lines doubling and briefly overlapping. runRoundTour below (via useSpeak's
 * speakSequence) now waits for each line's *real* completion, plus a short beat of silence,
 * before starting the next -- prompt, silence, then each card's sound in turn, each one
 * highlighting the card it names while it plays (styleguide 5's fix for "not intuitive" too: the
 * highlight teaches which card is which without reading). Any tap -- on a card, a bin, a number,
 * or the trail -- cancels the tour immediately and cleanly (stop(), below) before doing its own
 * thing, so a child who answers mid-tour is never left listening to a queue that has already
 * moved on without him.
 *
 * A wrong commit never fails the round (spec 6): it clears the in-progress selection, speaks
 * "Try another one", and the same round tries again.
 */
export function ActivityPlayer({ activity, householdId, profileId }: ActivityPlayerProps) {
  const router = useRouter();
  const { speak, replay, stop, speakSequence } = useSpeak();

  const [phase, setPhase] = useState<Phase>("intro");
  const [introBegun, setIntroBegun] = useState(false);
  const [roundIndex, setRoundIndex] = useState(0);
  const [armedId, setArmedId] = useState<string | undefined>(undefined);
  const [orderChosen, setOrderChosen] = useState<string[]>([]);
  const [groupPlacements, setGroupPlacements] = useState<Record<string, number>>({});
  // Task 42: which card the round-open tour is naming right now (its sound is playing), so that
  // card can highlight while it is spoken (styleguide 5: "audio synced to visual pointing" --
  // the fix for both the doubled/overlapping speech and "not intuitive": a non-reader learns
  // which card is which by watching the highlight track the voice, never by reading). Undefined
  // whenever the tour is not on a card (speaking the prompt, or not running at all).
  const [speakingItemId, setSpeakingItemId] = useState<string | undefined>(undefined);
  const [wrongFlash, setWrongFlash] = useState(false);
  const [wrongMessage, setWrongMessage] = useState("Try another one!");
  // Consecutive wrong taps on the CURRENT round only (task 12 brief: "repeated misses should help
  // more, not repeat"). Reset whenever the round changes (the phase/roundIndex effect below) or a
  // tap succeeds, so a child who gets it right on round 3 after 4 misses on round 2 hears round
  // 3's miss 1 line, not round 2's miss 5.
  const [missCount, setMissCount] = useState(0);

  const round = activity.rounds[roundIndex]!;
  const itemById = useMemo(() => new Map(round.items.map((it) => [it.id, it])), [round]);

  // Task 15, 1a: the intro used to be spoken from a mount effect, with no user gesture involved
  // at all. iPadOS Safari refuses speechSynthesis.speak outside a user gesture's own callback --
  // silently: no error is thrown, nothing is shown, and a child who cannot read gets nothing.
  // The intro is now spoken only from handleStart below, directly inside the tap-to-start
  // button's onClick, which both says the intro and (via useSpeak's resume()) unlocks the engine
  // for every line spoken for the rest of this activity. `introBegun` guards against a second tap
  // (or a fast double-tap, common at three years old) re-triggering it or double-scheduling the
  // advance to "round".

  // A beat of real silence between one tour line and the next (styleguide 5: "a beat of
  // silence, then each card's sound in turn... unhurried, then quiet") -- long enough to read as
  // a deliberate pause, short enough that the tour does not drag.
  const TOUR_PAUSE_MS = 550;

  // Task 28 (per-card tap-to-preview -> auto-announcement), revised by task 42 (real completion,
  // not a duration guess -- see the block comment above the ActivityPlayer function). Speaks the
  // round's prompt, then -- for the two kinds that used to rely on an arm-tap to preview a card
  // -- every item's `sound` once, in the same left-to-right order the cards are laid out on
  // screen, each highlighting its own card for as long as it is speaking (speakingItemId).
  // `groups` and `count` are excluded: a `groups` tap already replays its own card's sound every
  // time it is picked up, and `count`'s items are display-only, never a tap target.
  const runRoundTour = useCallback(
    (r: typeof round) => {
      const steps = [{ text: r.prompt, onStart: () => setSpeakingItemId(undefined) }];
      if (r.correct.kind === "pick" || r.correct.kind === "order") {
        for (const item of r.items) {
          if (!item.sound) continue;
          steps.push({ text: item.sound, onStart: () => setSpeakingItemId(item.id) });
        }
      }
      speakSequence(steps, TOUR_PAUSE_MS, () => setSpeakingItemId(undefined));
    },
    [speakSequence],
  );

  // Each round's prompt (then, for `pick`/`order`, every card's sound -- see runRoundTour above)
  // is spoken when the round becomes current, and the round's local interaction state (which
  // card is armed, what has been ordered or sorted so far) resets so a round never opens
  // carrying over a previous round's half-built answer.
  useEffect(() => {
    if (phase !== "round") return;
    // Resetting a round's local interaction state (which card is armed, what has been built so
    // far) when the round itself changes is exactly what this effect synchronizes; there is no
    // external event to defer it to, and JournalSpread's async-nested-callback pattern does not
    // apply here since nothing asynchronous is being awaited.
    /* eslint-disable react-hooks/set-state-in-effect */
    setArmedId(undefined);
    setOrderChosen([]);
    setGroupPlacements({});
    setMissCount(0);
    setSpeakingItemId(undefined);
    /* eslint-enable react-hooks/set-state-in-effect */
    runRoundTour(round);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, roundIndex]);

  // The star screen previously spoke nothing at all (task 12 brief, ux-audit finding: "not even
  // at the star" -- the child's only success signal was a silent screen change). This is the
  // child's confirmation that the whole activity, not just one round, is done.
  useEffect(() => {
    if (phase !== "star") return;
    speak("Yes! You got a star.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // The offScreen line is spoken once the star has been earned and the screen changes to show
  // it (task 12 brief: "the offScreen line spoken and shown as a picture prompt").
  useEffect(() => {
    if (phase !== "offscreen") return;
    speak(activity.offScreen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Screen time accrues per minute while this activity is open (spec 6; spec 2's 15-minute
  // cap), written through bumpScreenTime -- never checked or enforced here: the cap only ever
  // blocks starting a new activity from the hill, and this interval keeps running to the end of
  // whichever activity is already in progress (task 12 brief).
  //
  // Final review, finding I2: this had no .catch, an unhandled promise rejection on every
  // failed tick. Nothing is shown to the child either way (spec 6: nothing may be failable, and
  // a 3-year-old cannot read a message even if one appeared) -- the only difference a .catch
  // makes here is that a rejection is logged instead of silently vanishing, for a parent or
  // developer to find later. No retry is added: the interval itself already retries every
  // minute for as long as the activity stays open, so a single failed tick just means one
  // minute's worth of screen time is missing rather than the cap never firing again.
  useEffect(() => {
    const id = setInterval(() => {
      void bumpScreenTime(householdId, profileId, 1).catch((err) => {
        console.error("Wonderloop (Sprout): could not save a minute of screen time", err);
      });
    }, SCREEN_TIME_INTERVAL_MS);
    return () => clearInterval(id);
  }, [householdId, profileId]);

  // Holds the intro on screen until its speech genuinely finishes, then moves to the first round
  // (task 42: driven by useSpeak's real completion + its own fallback timer -- see the block
  // comment above useSpeak -- never a duration guess made here). A short beat of silence
  // (TOUR_PAUSE_MS) separates the intro's end from the round's own prompt starting, so the two
  // read as two distinct moments (styleguide 5: "the intro belongs to the activity open, the
  // prompt to the round, and they must never stack") rather than one running into the other.
  const handleStart = useCallback(() => {
    if (introBegun) return;
    setIntroBegun(true);
    speak(activity.intro, () => {
      setTimeout(() => setPhase("round"), TOUR_PAUSE_MS);
    });
  }, [introBegun, speak, activity.intro]);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  // Task 42: stop() cancels whatever the round-open tour is still saying (and clears its
  // highlight), immediately and cleanly, so any real tap always wins over it (styleguide 5: "a
  // tap is always honoured, immediately"). Called at the top of every tap handler below, before
  // that handler does its own thing (which, for a committing tap, includes its own speak() --
  // itself just as immediate a cancel, this just also clears the highlight no committing tap
  // otherwise would).
  const interruptTour = useCallback(() => {
    stop();
    setSpeakingItemId(undefined);
  }, [stop]);

  // Speech stops the moment this screen is left entirely (back to the hill, or navigating away
  // mid-tour/mid-feedback) rather than continuing to play over whatever appears next.
  useEffect(() => () => stop(), [stop]);

  const finishActivity = useCallback(() => {
    // The star screen shows immediately and unconditionally (spec 6: nothing may be failable,
    // and a 3-year-old cannot read an error even if one were shown) -- the write below is
    // purely a background record of what the child was just shown, never a gate on it.
    setPhase("star");
    const now = Date.now();
    const progress = {
      status: "done" as const,
      stepIndex: 0,
      problemIndex: 0,
      minutes: SPROUT_ACTIVITY_MINUTES,
      startedAt: now,
      completedAt: now,
      quest: emptyQuestProgress(),
      problems: {},
    };
    // Final review, finding I2: this had no .catch -- a failed write here left the star screen
    // shown for an activity nothing ever recorded as done, disagreeing with the hill and the
    // Parent view's SproutCard from then on, and produced an unhandled promise rejection.
    // Unlike the per-minute screen-time tick above, nothing calls this again on its own once
    // the activity is finished, so one silent retry after a short pause is cheap insurance
    // against a single transient failure; the child sees nothing different either way, and a
    // second, final failure is only ever logged, never shown.
    void startClock(householdId, profileId, Date.now()).catch(() => undefined);
    void saveQuestProgress(householdId, profileId, activity.id, progress).catch((err) => {
      console.error("Wonderloop (Sprout): could not save that activity as done, retrying once", err);
      setTimeout(() => {
        void saveQuestProgress(householdId, profileId, activity.id, progress).catch((retryErr) => {
          console.error("Wonderloop (Sprout): retry also failed to save that activity as done", retryErr);
        });
      }, 3_000);
    });
  }, [householdId, profileId, activity]);

  const commit = useCallback(
    (response: SproutResponse) => {
      interruptTour();
      const ok = checkRound(round, response);
      if (ok) {
        // Correct: name what was right (task 12 brief -- previously nothing was spoken here at
        // all), then hold the round in place until that line has genuinely been heard before
        // advancing (task 42: speak()'s own real-completion callback, not a duration guess --
        // the same fix as the round-open tour, for the same reason: the old guessed duration
        // under-ran real playback, so the next round's own prompt used to start -- and cut this
        // line off mid-word -- while it was still being said).
        setArmedId(undefined);
        setOrderChosen([]);
        setGroupPlacements({});
        setMissCount(0);
        const line = buildCorrectFeedback(round, response);
        speak(line, () => {
          if (roundIndex + 1 < activity.rounds.length) setRoundIndex((r) => r + 1);
          else finishActivity();
        });
        return;
      }
      // Wrong: no fail state (spec 6) -- spoken feedback that names what was touched and what is
      // wanted, escalating over consecutive misses on this round (task 12 brief); the selection
      // clears and the same round tries again, forever if needed.
      setArmedId(undefined);
      setOrderChosen([]);
      setGroupPlacements({});
      const nextMiss = missCount + 1;
      setMissCount(nextMiss);
      const line = buildWrongFeedback(round, response, nextMiss);
      speak(line);
      setWrongMessage(line);
      setWrongFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setWrongFlash(false), 1400);
    },
    [round, roundIndex, activity.rounds.length, finishActivity, speak, missCount, interruptTour],
  );

  function handleCardTap(item: SproutItem) {
    // Task 42: any tap on a card cancels the round-open tour immediately, even one that (for
    // `order`) does not go on to speak anything itself -- an in-progress `order` build should
    // never keep competing with tour audio for a card the child has already moved past.
    interruptTour();
    const correct = round.correct;
    // Task 28: one tap answers. The old arm-then-confirm step (a first tap previewing the
    // card's sound, a second tap on the same card committing it) is gone for `pick` and
    // `order` -- an actual 3-year-old tapped the right card, nothing visibly happened, and a
    // second deliberate tap on the exact same spot is not a gesture a non-reader can be
    // expected to discover on his own. Re-hearing a card no longer needs a tap at all: see
    // runRoundTour above and the always-on-screen speaker control.
    if (correct.kind === "pick") {
      commit({ kind: "pick", itemIds: [item.id] });
      return;
    }
    if (correct.kind === "order") {
      if (orderChosen.includes(item.id)) return;
      const next = [...orderChosen, item.id];
      setOrderChosen(next);
      if (next.length === round.items.length) commit({ kind: "order", itemIds: next });
      return;
    }
    if (correct.kind === "groups") {
      if (item.id in groupPlacements) {
        // Placed already: tapping it again takes it back out of its pile so a mis-sort is
        // always correctable before the round auto-checks.
        const next = { ...groupPlacements };
        delete next[item.id];
        setGroupPlacements(next);
        setArmedId(item.id);
        if (item.sound) speak(item.sound);
        return;
      }
      setArmedId(item.id);
      if (item.sound) speak(item.sound);
    }
  }

  function handleBinTap(binIndex: number) {
    interruptTour();
    if (round.correct.kind !== "groups" || !armedId) return;
    const next = { ...groupPlacements, [armedId]: binIndex };
    setArmedId(undefined);
    setGroupPlacements(next);
    if (Object.keys(next).length === round.items.length) {
      const groupCount = round.correct.kind === "groups" ? round.correct.groups.length : 0;
      const groups: string[][] = Array.from({ length: groupCount }, () => []);
      for (const [id, idx] of Object.entries(next)) groups[idx]?.push(id);
      commit({ kind: "groups", groups });
    }
  }

  function handleNumberTap(n: number) {
    interruptTour();
    commit({ kind: "count", value: n });
  }

  // Task 28: a tap anywhere on the trail (the pattern shown for context, never the answer) used
  // to be silently inert -- which never dead-ended a round, but also never told a child who
  // tapped a pattern card that he had not answered yet. This names what happened and points him
  // at the real choices instead, the same "say what was touched, say what is wanted" shape every
  // other piece of spoken feedback in this player uses -- and, unlike a wrong commit, never
  // counts as a miss and never escalates, since nothing was actually answered.
  function handleTrailTap() {
    interruptTour();
    speak("That shows the pattern. Tap one of the cards below to answer.");
  }

  function handleReferenceTap() {
    interruptTour();
    speak("That is the one to match. Tap one of the cards below to answer.");
  }

  // Reference material is shown, never offered, so it leaves the pool of choices before the
  // pattern-trail split below is worked out (see SproutItem.reference). Week 5's cup rounds put
  // the cups in among the block piles as a fourth card of exactly the same kind; a child told to
  // tap the pile matching the cups can very reasonably tap the cups, and be marked wrong for it.
  const referenceItems = round.items.filter((it) => it.reference);
  const offered = round.items.filter((it) => !it.reference);
  const showTrail = activity.kind === "tap-next" && round.correct.kind === "pick";
  const trailItems = showTrail ? offered.slice(0, Math.max(0, offered.length - 2)) : [];
  const choiceItemsAll = showTrail ? offered.slice(-2) : offered;
  const choiceItems =
    round.correct.kind === "order"
      ? choiceItemsAll.filter((it) => !orderChosen.includes(it.id))
      : round.correct.kind === "groups"
        ? choiceItemsAll.filter((it) => !(it.id in groupPlacements))
        : choiceItemsAll;

  return (
    <div className="sp-player">
      <div className="sp-player__top">
        {/* Task 28: while a round is showing, this replays the round's full tour -- prompt, then
            every card's sound in order, each with its highlight (runRoundTour) -- not just the
            single most-recently spoken line, so a child can re-hear every card as many times as
            he wants with one big, already-familiar button instead of a per-card control or a
            long press (see the block comment above the ActivityPlayer function for why those
            were rejected). Every other phase keeps the plain "repeat the last line" behaviour
            (useSpeak's replay()), which is exactly right there: there is only ever one line on
            screen to repeat. */}
        <button
          type="button"
          className="sp-speaker"
          aria-label="Play the words again"
          onClick={phase === "round" ? () => runRoundTour(round) : replay}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--forest)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9v6h4l6 5V4l-6 5z" fill="var(--forest)" stroke="none" />
            <path d="M17 9a5 5 0 010 6M20 6a9 9 0 010 12" />
          </svg>
        </button>
        {phase === "round" ? (
          <div className="sp-progress" aria-label={`Round ${roundIndex + 1} of ${activity.rounds.length}`}>
            {activity.rounds.map((r, i) => (
              <span key={r.id} className={`sp-progress__dot${i <= roundIndex ? " sp-progress__dot--on" : ""}`} />
            ))}
          </div>
        ) : null}
        <button type="button" className="sp-exit" aria-label="Back to the hill" onClick={() => router.push("/sprout")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--forest)" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {phase === "intro" ? (
        <div className="sp-intro">
          {/* Task 15, 1a: a large, wordless, obviously tappable picture -- nothing here needs
              reading, and the tap is what makes speech (the intro, then every round) possible on
              an iPad at all. `disabled` once tapped, so a fast double-tap can't re-speak the
              intro or double-schedule the advance to the first round. */}
          <button
            type="button"
            className="sp-start"
            aria-label={`Start ${activity.title}`}
            disabled={introBegun}
            onClick={handleStart}
          >
            <svg viewBox="0 0 24 24" fill="var(--cream)" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>
      ) : null}

      {phase === "round" ? (
        <div className="sp-round">
          {showTrail ? (
            // Task 28: an actual 3-year-old tapped a trail card (the pattern shown for context)
            // instead of a choice -- the two used to sit in one undivided flex-wrapped row with
            // nothing but a little opacity telling them apart. sp-trail now renders as its own
            // dashed, tinted strip -- a visually different KIND of thing from the raised,
            // shadowed sp-card choices below, not just a dimmer version of the same card -- with
            // real space of its own before the choices start. The whole strip is one tap target
            // (not per-card) so an imprecise toddler tap anywhere in it still lands on something,
            // and it is never a wrong answer: it just names what it is and points at the real
            // choices (handleTrailTap). Kept aria-hidden -- the spoken line, not this DOM
            // structure, is this app's accessible surface for a non-reader, same as everywhere
            // else in this player.
            <div className="sp-trail" aria-hidden="true" onClick={handleTrailTap}>
              {trailItems.map((it) => (
                <div className="sp-trail__item" key={it.id}>
                  <ItemGlyph item={it} size={56} />
                </div>
              ))}
            </div>
          ) : null}

          {referenceItems.length > 0 ? (
            // The same flat, dashed strip the pattern trail uses, for the same reason: a child has
            // to see at a glance that this is the question, not one of the answers. Tapping it is
            // never wrong, it just says what it is and points at the choices.
            <div className="sp-trail sp-trail--reference" aria-hidden="true" onClick={handleReferenceTap}>
              {referenceItems.map((it) => (
                <div className="sp-trail__item" key={it.id}>
                  <ItemGlyph item={it} size={56} showCount />
                </div>
              ))}
            </div>
          ) : null}

          {round.correct.kind === "order" && orderChosen.length > 0 ? (
            <div className="sp-order-track" aria-label={`${orderChosen.length} of ${round.items.length} placed`}>
              {orderChosen.map((id) => {
                const it = itemById.get(id);
                return it ? <ItemGlyph key={id} item={it} size={48} /> : null;
              })}
            </div>
          ) : null}

          {round.correct.kind === "count" ? (
            <div className="sp-display" aria-label="Look and count">
              {/* `offered`, not round.items: a reference item already draws in its own strip
                  above, and drawing it here too put it in the very pile the child is counting. */}
              {offered.map((it) => (
                <ItemGlyph key={it.id} item={it} size={72} showCount />
              ))}
            </div>
          ) : (
            <div className="sp-choices">
              {choiceItems.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`sp-card${armedId === it.id ? " sp-card--armed" : ""}${speakingItemId === it.id ? " sp-card--speaking" : ""}`}
                  aria-label={describeItem(it)}
                  onClick={() => handleCardTap(it)}
                >
                  {/* showCount, because a choice card can BE a pile: "tap the pile with more
                      flowers" draws every choice identically without it. */}
                  <ItemGlyph item={it} showCount />
                </button>
              ))}
            </div>
          )}

          {round.correct.kind === "groups" ? (
            <div className="sp-bins">
              {round.correct.groups.map((_, i) => {
                const placedIds = Object.entries(groupPlacements)
                  .filter(([, idx]) => idx === i)
                  .map(([id]) => id);
                return (
                  <button key={i} type="button" className="sp-bin" aria-label={`Pile ${i + 1}`} onClick={() => handleBinTap(i)}>
                    {placedIds.map((id) => {
                      const it = itemById.get(id);
                      return it ? <ItemGlyph key={id} item={it} size={40} /> : null;
                    })}
                  </button>
                );
              })}
            </div>
          ) : null}

          {round.correct.kind === "count" ? (
            /* The row is derived from the round (countButtonValues: floor of 6, extended to the
               round's own maximum need) -- .sp-numbers flex-wraps, so more buttons than fit one
               row wrap to a second row at full 64px size rather than shrinking (styleguide 5:
               tap targets stay large). */
            <div className="sp-numbers">
              {countButtonValues(round).map((n) => (
                <button key={n} type="button" className="sp-number" aria-label={String(n)} onClick={() => handleNumberTap(n)}>
                  {n}
                </button>
              ))}
            </div>
          ) : null}

          {/* This toast is for a watching parent only -- the child's path never depends on
              reading it, only on hearing the identical line just spoken via speak(line) above. */}
          {wrongFlash ? <Toast tone="hint" message={wrongMessage} className="sp-toast" /> : null}
        </div>
      ) : null}

      {phase === "star" ? (
        <button type="button" className="sp-star-screen" aria-label="You got a star. Tap to continue." onClick={() => setPhase("offscreen")}>
          <Star earned size={160} />
        </button>
      ) : null}

      {phase === "offscreen" ? (
        <div className="sp-offscreen">
          <svg className="sp-offscreen__art" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="44" fill="var(--sun)" />
            <circle cx="42" cy="46" r="7" fill="var(--forest)" />
            <path d="M30 66q20 14 40 0" stroke="var(--forest)" strokeWidth="4" fill="none" strokeLinecap="round" />
            <circle cx="66" cy="40" r="16" fill="none" stroke="var(--forest)" strokeWidth="4" />
            <path d="M77 51l10 10" stroke="var(--forest)" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <p className="sp-offscreen__caption">{activity.offScreen}</p>
          {/* Minor finding (task-12 fix1 review, Issue 5): this is visible text with no spoken
              equivalent, unlike every other control in the player. It is the only control on
              this screen, so it was always tappable blind -- speaking it on tap is the cheap
              fix, matching how every other line here is said aloud through the same speak(). */}
          <Button
            variant="primary"
            onClick={() => {
              speak("Back to the hill");
              router.push("/sprout");
            }}
          >
            Back to the hill
          </Button>
        </div>
      ) : null}
    </div>
  );
}
