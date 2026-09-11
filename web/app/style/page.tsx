"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Header } from "@/components/ui/Header";
import { Patch } from "@/components/ui/Patch";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SeasonTrail, type SeasonTrailWeek } from "@/components/ui/SeasonTrail";
import { Stamp } from "@/components/ui/Stamp";
import { Toast } from "@/components/ui/Toast";
import { TrackCard } from "@/components/ui/TrackCard";
import { ProblemFigure } from "@/components/quest/ProblemFigure";

const TRAIL_WEEKS: SeasonTrailWeek[] = [
  { week: 1, status: "done", showcase: false },
  { week: 2, status: "done", showcase: false },
  { week: 3, status: "done", showcase: false },
  { week: 4, status: "done", showcase: true, flag: "Gadget demo, October 2" },
  { week: 5, status: "done", showcase: false },
  { week: 6, status: "done", showcase: false },
  { week: 7, status: "current", showcase: false },
  { week: 8, status: "todo", showcase: true },
  { week: 9, status: "todo", showcase: false },
  { week: 10, status: "todo", showcase: false },
  { week: 11, status: "todo", showcase: false },
  { week: 12, status: "todo", showcase: true },
];

/** Same trail, but the week 8 flag is 26 characters, longer than the 22-character clamp, to show the truncation. */
const TRAIL_WEEKS_LONG_FLAG: SeasonTrailWeek[] = [
  { week: 1, status: "done", showcase: false },
  { week: 2, status: "done", showcase: false },
  { week: 3, status: "done", showcase: false },
  { week: 4, status: "done", showcase: true, flag: "Gadget demo, October 2" },
  { week: 5, status: "done", showcase: false },
  { week: 6, status: "done", showcase: false },
  { week: 7, status: "done", showcase: false },
  { week: 8, status: "done", showcase: true, flag: "Robot rumble, November 20" },
  { week: 9, status: "current", showcase: false },
  { week: 10, status: "todo", showcase: false },
  { week: 11, status: "todo", showcase: false },
  { week: 12, status: "todo", showcase: true },
];

const LED_PATTERN = [
  false, true, true, true, false,
  true, false, false, false, true,
  true, false, true, false, true,
  true, false, false, false, true,
  false, true, true, true, false,
];

function RobotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="5" y="7" width="14" height="11" rx="2" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      <path d="M12 3v4M9 18v3M15 18v3" />
    </svg>
  );
}

function ProofIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M4 20 L12 4 L20 20z" />
      <path d="M8 20 l4-8 4 8" />
    </svg>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-[1080px] px-6 py-8">
      <p className="tr-eyebrow mb-3">{label}</p>
      <Card tone="surface" shadow className="!p-6">
        {children}
      </Card>
    </section>
  );
}

export default function StyleGalleryPage() {
  const [toastVisible, setToastVisible] = useState(true);

  return (
    <div>
      <Header userName="Explorer" initials="EX" />

      <Section label="Buttons: five tiers, one meaning each (task 20)">
        <p style={{ color: "var(--muted)", marginTop: 0, marginBottom: 16, fontSize: 14, maxWidth: 640 }}>
          The owner used the live app and found no system: the rename control and the &quot;already
          bought this&quot; label were both dashed and button-shaped, some buttons were filled red and
          others were dashed with no colour, and nothing lined up. This is the fix -- a hard rule
          first: <strong>a dashed border no longer means &quot;button&quot;</strong> anywhere in this app.
          Dashed stays reserved for a genuinely empty or placeholder area (an empty mistake box, a
          locked patch, Sprout&apos;s own exempt drop bin) -- see EmptyState below for one.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
        <dl style={{ marginTop: 14, marginBottom: 0, display: "grid", gap: 8, fontSize: 14, color: "var(--muted)" }}>
          <div>
            <strong style={{ color: "var(--forest)" }}>Primary</strong> -- the one thing this screen or
            section is for. Filled, at most one per group. Start, Resume, Check, Continue.
          </div>
          <div>
            <strong style={{ color: "var(--forest)" }}>Secondary</strong> -- a real, always-visible
            dashboard action that is not the one thing. Rename, Add activity, Mark as bought, Open as
            Explorer.
          </div>
          <div>
            <strong style={{ color: "var(--forest)" }}>Quiet</strong> -- low-stakes, easily reversible,
            or pure navigation. Back, Cancel, Skip for now, Stuck come back later.
          </div>
          <div>
            <strong style={{ color: "var(--blaze-deep)" }}>Destructive</strong> -- a reset that
            permanently deletes a child&apos;s work, and nothing else ever gets this tier. Its warning
            icon, double border and tighter corners are what tell it apart from every other tier
            without relying on colour -- a colour-blind parent still sees a different shape, not just
            a different red.
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 20 }}>
          <Button variant="primary" disabled>
            Try again in 0:38
          </Button>
          <Button variant="secondary" disabled>
            Disabled secondary
          </Button>
          <Button variant="destructive" disabled>
            Disabled destructive
          </Button>
          <Button variant="secondary" href="#">
            As a link
          </Button>
        </div>
        <p style={{ color: "var(--muted)", marginTop: 8, marginBottom: 0, fontSize: 14 }}>
          Disabled: every tier drops to half opacity with a not-allowed cursor. It stays visibly its
          own tier underneath -- disabled never collapses two tiers into one look.
        </p>

        <p style={{ color: "var(--muted)", marginTop: 20, marginBottom: 4, fontSize: 14 }}>
          The row this rebuild was actually about (Parent view, Explorer detail) -- status, a real
          action, and the destructive action visibly set apart, not three look-alike dashed boxes:
        </p>
        <div className="pr-weekplan__row-actions">
          <Chip tone="positive">Done</Chip>
          <Button variant="secondary">Open as Explorer</Button>
          <Button variant="destructive">Reset this quest</Button>
        </div>

        <Card tone="forest" className="!p-4" style={{ marginTop: 20, display: "inline-block" }}>
          <Button variant="default">Switch profile</Button>
        </Card>
        <p style={{ color: "var(--muted)", marginTop: 8, marginBottom: 0, fontSize: 14 }}>
          &quot;Default&quot; is not a sixth tier -- it exists only for SwitchProfileButton, whose white
          fill needs to hold its own contrast on the forest header regardless of what is behind it
          (shown here on that same dark surface). It is never used next to a field, and never for a
          general-purpose action.
        </p>
      </Section>

      <Section label="Fields and read-only values (task 23)">
        <p style={{ color: "var(--muted)", marginTop: 0, marginBottom: 16, fontSize: 14, maxWidth: 680 }}>
          The button rebuild above covered controls; it never covered fields or read-only values,
          which is exactly where the owner found the next three defects: a household invite code
          boxed identically to the &quot;Copy code&quot; button beside it, an empty field sharing
          Secondary&apos;s own white-fill-plus-2px-forest-border look, and a field/button pair in
          the same row sized differently so it did not line up. Two more tiers, same rule as
          buttons and chips -- each look means one thing everywhere it appears:
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="primary">Check</Button>
          <Button variant="secondary">Secondary</Button>
          <div className="tr-week-picker" style={{ marginTop: 0 }}>
            <label htmlFor="style-gallery-select">Jump to a different week</label>
            <select id="style-gallery-select" defaultValue="Week 1">
              <option>Week 1</option>
              <option>Week 2</option>
              <option>Week 3</option>
            </select>
          </div>
          <label className="flex flex-col gap-1" style={{ fontSize: 13, color: "var(--muted)" }}>
            Your answer
            <input className="tr-answer__input" defaultValue="300" aria-label="Your answer" />
          </label>
        </div>
        <dl style={{ marginTop: 14, marginBottom: 0, display: "grid", gap: 8, fontSize: 14, color: "var(--muted)" }}>
          <div>
            <strong style={{ color: "var(--forest)" }}>Field</strong> -- a select or a typed
            answer, one consistent treatment everywhere: a thin neutral border
            (--field-border, not --forest) plus a faint inset shadow so it reads as a shallow well
            to type into, never Secondary&apos;s bold 2px solid line and flat white fill.
          </div>
        </dl>
        <p style={{ color: "var(--muted)", marginTop: 12, marginBottom: 20, fontSize: 14 }}>
          Every one of these is --control-height (48px) tall -- Primary, Secondary, the select and
          the typed answer alike -- so any row mixing a button with a field still lines up. That is
          the general rule, not a one-off: anything sharing a row with a control shares the
          control height.
        </p>

        <p style={{ color: "var(--muted)", marginTop: 0, marginBottom: 8, fontSize: 14, maxWidth: 680 }}>
          The exact row the owner flagged -- a household invite code beside its Copy button, now
          fixed. The code is a value to read or copy, never a control: no border at all (Chip&apos;s
          own rule -- never a border, dashed or otherwise -- applies here too), a filled tint
          instead of Secondary&apos;s white, and the same --control-height so it still lines up with
          the real button beside it.
        </p>
        <div className="pr-invite__code-row" style={{ marginTop: 0 }}>
          <code className="pr-invite__code">R7KXD8</code>
          <Button variant="secondary">Copy code</Button>
        </div>
        <dl style={{ marginTop: 14, marginBottom: 0, display: "grid", gap: 8, fontSize: 14, color: "var(--muted)" }}>
          <div>
            <strong style={{ color: "var(--forest)" }}>Read-only value</strong> -- shown to read or
            copy, like the invite code. Closer to a status Chip than a button: filled, never
            bordered, and never trying to look pressable.
          </div>
        </dl>

        <p style={{ color: "var(--muted)", marginTop: 20, marginBottom: 8, fontSize: 14, maxWidth: 680 }}>
          The shopping list&apos;s &quot;Undo&quot; after marking an item bought was the owner&apos;s
          fourth report: plain text, nothing to say it could be clicked. It was already Quiet; Quiet
          itself had nothing left to read as a control once its fill and border were both removed.
          Quiet buttons (never quiet links -- see components/ui/Button.tsx and verify:ui&apos;s own
          link-button-underline rule) now carry an underline:
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Chip tone="positive">Bought</Chip>
          <Button variant="quiet">Undo</Button>
        </div>
      </Section>

      <Section label="Cards">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card tone="surface">
            <p className="tr-eyebrow mb-1">Surface</p>
            <p style={{ color: "var(--muted)", margin: 0 }}>White card, ink text, used for tracks and notes.</p>
          </Card>
          <Card tone="kraft">
            <p className="tr-eyebrow mb-1">Kraft</p>
            <p style={{ color: "var(--ink)", margin: 0 }}>Kraft-toned panel, used for hints and side rails.</p>
          </Card>
          <Card tone="forest">
            <p className="tr-eyebrow mb-1" style={{ color: "#f2c7be" }}>
              Forest
            </p>
            <p style={{ color: "rgba(255,255,255,.85)", margin: 0 }}>Dark panel, used for the monster problem and the patch sash.</p>
          </Card>
        </div>
      </Section>

      <Section label="Status: never a button (task 20)">
        <p style={{ color: "var(--muted)", marginTop: 0, marginBottom: 12, fontSize: 14, maxWidth: 640 }}>
          &quot;Done&quot;, &quot;In progress&quot;, &quot;Not started&quot;, &quot;Already have this&quot;,
          &quot;Needed soon&quot; -- these are facts about a thing, never a control. A Chip is built to
          be unmistakable from a button on every axis a glance can catch, not just colour: a pill, not
          a rounded rectangle; about half a button&apos;s height; a small mono-spaced label instead of
          bold body text; and never any border, dashed or otherwise.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Chip>Fractions</Chip>
          <Chip tone="positive">Done</Chip>
          <Chip tone="progress">In progress</Chip>
          <Chip tone="money">$40</Chip>
          <Chip tone="flag">Needed soon</Chip>
        </div>
        <dl style={{ marginTop: 14, marginBottom: 0, display: "grid", gap: 8, fontSize: 14, color: "var(--muted)" }}>
          <div>
            <strong style={{ color: "var(--forest)" }}>Neutral</strong> -- a plain subject or category
            tag (a topic, a debate side).
          </div>
          <div>
            <strong style={{ color: "var(--moss-text)" }}>Positive</strong> -- finished or satisfied:
            a done track, an approved explain-it answer, an item already bought.
          </div>
          <div>
            <strong style={{ color: "var(--blaze-deep)" }}>Progress</strong> -- actively under way,
            neither done nor unstarted.
          </div>
          <div>
            <strong style={{ color: "#6b4f00" }}>Money</strong> -- an approximate cost, or
            &quot;Already have this&quot; when nothing is owed.
          </div>
          <div>
            <strong style={{ color: "var(--forest)" }}>Flag</strong> (task 14, recoloured task 24) --
            something newly needed, due soon enough to act on now. Never the app&apos;s error/destructive
            red: that read as a warning on a shopping list.
          </div>
        </dl>
        <p style={{ color: "var(--muted)", marginTop: 14, marginBottom: 0, fontSize: 14 }}>
          Placed next to real controls (the row above, in Buttons), the difference should never take a
          second look: a parent should never wonder whether &quot;Done&quot; is something to press.
        </p>
      </Section>

      <Section label="Progress bars">
        <div className="flex flex-col gap-3 max-w-sm">
          <ProgressBar value={100} tone="moss" label="Build progress, done" />
          <ProgressBar value={44} tone="blaze" label="Think progress, 44 percent" />
          <ProgressBar value={0} tone="blaze" label="Speak progress, not started" />
        </div>
      </Section>

      <Section label="Stamps">
        <div className="flex flex-wrap items-center gap-6">
          <Stamp label={"done\ntue"} size="sm" />
          <Stamp label={"done\nnov 3"} size="lg" />
        </div>
      </Section>

      <Section label="Season trail, week 7 of 12">
        <SeasonTrail weeks={TRAIL_WEEKS} />
      </Section>

      <Section label="Season trail, long flag label">
        <SeasonTrail weeks={TRAIL_WEEKS_LONG_FLAG} />
      </Section>

      <Section label="Track cards: done, in progress, not started">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TrackCard
            eyebrow="Build · 60 min"
            title="Obstacle avoidance"
            description="Maqueen turns before it hits the wall. Science moment: sound and echoes."
            status="done"
            progress={100}
            meta="Photo + Maker's Log in the journal"
            ctaLabel="Open the journal page"
            ctaHref="#"
            stampLabel={"done\ntue"}
            ledPattern={LED_PATTERN}
          />
          <TrackCard
            eyebrow="Think · 75 min"
            title="Percent, and prove it"
            description="Warm-up, then percent on real receipts, then three short proofs."
            status="current"
            progress={44}
            meta="Problem 5 of 9 · about 40 min left"
            ctaLabel="Resume at problem 5"
            ctaHref="#"
          />
          <TrackCard
            eyebrow="Speak · 45 min"
            title="Cross-examination"
            description="Ask one question that makes the other side wobble."
            status="todo"
            progress={0}
            meta="Not started"
            ctaLabel="Start"
            ctaHref="#"
          />
        </div>
      </Section>

      <Section label="Patches: earned and locked">
        <Card tone="forest" className="!p-6">
          <p className="tr-eyebrow mb-3" style={{ color: "#cfe0cb" }}>
            Patches · 5 earned
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 max-w-xl">
            <Patch label="First Robot" icon={<RobotIcon />} state="earned" caption="October 12, 4:05 PM" />
            <Patch label="First Proof" icon={<ProofIcon />} state="earned" caption="October 19, 6:40 PM" />
            <Patch
              label="Bug Hunter"
              state="locked"
              caption="For writing three Maker's Logs that really dig into what went wrong."
            />
          </div>
        </Card>
      </Section>

      <Section label="Empty state: where dashed still lives">
        <EmptyState
          title="Nothing here yet"
          description="Once a quest is finished, its photo and Maker's Log will show up on this spread."
          action={
            <Button variant="primary" href="#">
              Start the next quest
            </Button>
          }
        />
        <p style={{ color: "var(--muted)", marginTop: 12, marginBottom: 0, fontSize: 14 }}>
          This box&apos;s dashed border (.tr-empty) is the hard rule&apos;s one legitimate use: a
          genuinely empty area with nothing in it yet, never an action. The same reasoning covers a
          locked patch and an exhausted problem&apos;s outcome panel elsewhere in the app.
        </p>
      </Section>

      <Section label="Figures: a keyboard and a bar of beats (the Play track's visual guides)">
        <ProblemFigure figure={{ kind: "keys", alt: "One octave from C4, with C4, E4 and G4 highlighted: the C major chord.", spec: { octaves: 1, from: "C4", highlight: ["C4", "E4", "G4"], labels: true } }} />
        <ProblemFigure figure={{ kind: "beats", alt: "Four beats: clap, rest, clap, held.", spec: { beats: 4, pattern: "x.x-", count: ["1", "2", "3", "4"] } }} />
      </Section>
      <Section label="Figures that move: a diagram with frames, and a 3D scene to drag">
        <ProblemFigure
          figure={{
            kind: "diagram",
            alt: "An 8-tooth driver gear turns a 24-tooth driven gear; a red mark on each rim shows the small gear making three turns for one turn of the big one.",
            spec: {
              w: 360,
              h: 200,
              items: [
                { t: "circle", cx: 90, cy: 100, r: 40, label: "8-tooth", fill: "sand" },
                { t: "circle", cx: 210, cy: 100, r: 80, label: "24-tooth", fill: "sand" },
                { t: "dot", cx: 90, cy: 60, label: "mark", side: "above" },
                { t: "dot", cx: 210, cy: 20, label: "mark", side: "above" },
                { t: "text", x: 180, y: 195, s: "3 turns in, 1 turn out", anchor: "middle" },
              ],
              frames: [
                { ms: 800, caption: "start: both marks at the top", set: {} },
                { ms: 800, caption: "small gear: one turn", set: { "2": { cx: 90, cy: 60 }, "3": { cx: 141, cy: 60, label: "" } } },
                { ms: 800, caption: "small gear: two turns", set: { "2": { cx: 90, cy: 60 }, "3": { cx: 279, cy: 140, label: "" } } },
                { ms: 800, caption: "three turns in, one turn out", set: { "2": { cx: 90, cy: 60 }, "3": { cx: 210, cy: 20 } } },
              ],
            },
          }}
        />
        <ProblemFigure figure={{ kind: "scene", alt: "A cube net folding into a cube; drag to turn it, slide to fold it.", spec: { type: "net-cube" } }} />
        <ProblemFigure figure={{ kind: "scene", alt: "The printed quadruped: slide to lift one foot at a time and watch the support triangle and the centre of mass.", spec: { type: "walker" } }} />
        <ProblemFigure figure={{ kind: "scene", alt: "A three joint arm: slide to reach out and read what the servo can still hold.", spec: { type: "arm", torqueKgCm: 2.2 } }} />
      </Section>
      <Section label="Figure: a diagram (the Make track's visual guide for wiring, mechanisms and frames)">
        <ProblemFigure
          figure={{
            kind: "diagram",
            alt: "The ESP32 drives the H-bridge, which drives both motors; the battery feeds the H-bridge; the encoders feed back to the ESP32.",
            spec: {
              w: 420,
              h: 200,
              wide: true,
              items: [
                { t: "box", x: 20, y: 70, w: 100, h: 50, label: "ESP32", sub: "pins 25, 26" },
                { t: "box", x: 170, y: 70, w: 100, h: 50, label: "H-bridge", sub: "TB6612" },
                { t: "box", x: 320, y: 20, w: 80, h: 44, label: "Motor L", fill: "sand" },
                { t: "box", x: 320, y: 130, w: 80, h: 44, label: "Motor R", fill: "sand" },
                { t: "box", x: 170, y: 150, w: 100, h: 36, label: "Battery 2S", fill: "accent" },
                { t: "line", x1: 120, y1: 95, x2: 168, y2: 95, arrow: true, label: "PWM" },
                { t: "line", x1: 270, y1: 85, x2: 318, y2: 44, arrow: true },
                { t: "line", x1: 270, y1: 105, x2: 318, y2: 150, arrow: true },
                { t: "line", x1: 220, y1: 150, x2: 220, y2: 122, arrow: true, color: "rust", label: "7.4 V" },
                { t: "line", x1: 320, y1: 60, x2: 70, y2: 68, dashed: true, color: "green", label: "encoder" },
                { t: "dim", x1: 20, y1: 30, x2: 120, y2: 30, label: "48 mm" },
              ],
            },
          }}
        />
      </Section>
      <Section label="Toast">
        <div className="flex flex-col gap-3">
          <Toast tone="info" message="Saved to your journal." />
          <Toast tone="success" message="Quest complete. Patch earned: First Proof." />
          <Toast tone="hint" message="Hint 1 unlocked." />
          {toastVisible ? (
            <Toast tone="info" message="Dismissible toast." onDismiss={() => setToastVisible(false)} />
          ) : (
            <Button variant="quiet" onClick={() => setToastVisible(true)}>
              Show the dismissible toast again
            </Button>
          )}
        </div>
      </Section>
    </div>
  );
}
