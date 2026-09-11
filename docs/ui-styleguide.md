# Wonderloop UI review checklist

What the owner looks for. Every rule here traces to a real defect he caught on a real device that every automated gate had passed. Walk this list against **screenshots you have actually looked at** before reporting any UI work done. Gate-green is not done.

The approved design is `design-demos/trail-v2.html`. The control language is the five-tier taxonomy (commit `13b42c1`) plus the field and value treatments (`013f540`). This checklist is how those get enforced by eye.

---

## 1. Controls: pressable looks pressable, nothing else does

- **One primary action per group.** Solid blaze fill. If two red buttons are visible at once, one of them is wrong. (Caught twice: quest last-problem cluster, twice.)
- **Secondary** actions are bordered buttons. **Quiet** actions (Back, Skip, Undo) are lighter but must still look actionable: underline or clear affordance, never bare grey text. (Caught: "undo is just text".)
- **A dashed border never means button.** Dashed is reserved for genuinely empty or placeholder regions. (Caught: Rename and "already bought" indistinguishable.)
- **Status is not a control.** Chips are small, borderless, mono type, ~24px. A parent must never wonder whether a label is a button. (Caught: "Needed soon", "Done".)
- **Read-only values are not controls.** The invite code gets a tint and no border, never a button-like box beside a real button. (Caught: code looked like the Copy button.)
- **Destructive is unmistakable without colour**: warning icon, double border, different corners. Colour blindness is common in boys. (Ruling from the reset controls.)
- **Disabled still reads as deliberate**, not broken: full-colour text, reduced affordance only. Contrast stays legible; a WCAG exemption is not a licence for 2.3:1. (Caught: washed-out Check, unreadable Skip.)
- Prefer a pressable control with a helpful message over a disabled one: "Type your answer first" teaches; a dead button does not.

- **Every screen has a plain way home that is not a verdict.** The quest screen's only visible
  exit was "Stuck, come back later", which parks the quest; a child who simply wanted to stop for
  the day read it as the wrong door and did not know how to get back. Now the header carries the
  This week, Portfolio and Skills map links on quest screens too, and a line beside the park box
  says "Done for now? Back to This Week. Everything you finished is saved." (Caught by the owner
  on the first real session, 5 September 2026.)
- **A failed save names its cause.** "That did not save" alone left the family with nothing to
  report; the toast now carries the Firebase error code in brackets when there is one. (Same
  session: a MakeCode link that would not save, cause still unknown.)
- **A URL in content is a link.** Step bodies and prompts render every URL as a link that opens in a
  new tab; a child cannot retype makecode.microbit.org from a paragraph. (Caught by the owner on the
  first real session, 5 September 2026.)
- **Every way in that can work is offered.** A photo can be taken with the device's own camera in
  the app or chosen from what is already on it, both buttons side by side; the old single file input
  with `capture` jumped to the camera on a phone and to a file picker on a laptop, so the family saw
  one door and it was the wrong one for the device in hand. (Same session.)
- **A program is a numbered list, and a picture on a screen is shown moving.** Build bodies use
  ordered lists, one action per item, and a step that describes an LED picture carries an animated
  micro:bit figure (`components/quest/LedMatrix.tsx`). (Same session: the program as a paragraph
  threw him off, and the LED explanation needed the lights to be seen.)
- **More is offered, never required.** A quest's extras sit behind one rail entry, "If there is
  time", with a done count, and read as cards with a quiet "I did this"; the required steps and
  their Continue never change. (Owner's ask after the first Build session, 6 September 2026.)
- **A family's own key, never shown twice.** The Parent view's AI card takes a key in a password
  field, checks it once, and afterwards shows only "On" and its last four characters; the debate
  room without a key offers an out-loud debate rather than a dead end. (Owner decision, opening
  the app to other families, 6 September 2026.)
- **Consent before the household exists.** A first sign-in stops at one screen: the privacy notice
  and terms linked, one tick that the person is a parent or guardian, one button. (Same decision.)
- **A stray tap never loses work.** Anything that deletes or throws away what a child made either
  asks first or can be undone: Reset week and Reset season sit behind a confirm dialog that names
  what goes; Start season N confirms inline; the working space's Clear turns into Undo clear until
  the next stroke; Record again on an unsaved recording asks "Throw this recording away?" with Keep
  it beside it. Stuck, come back later, Skip for now and Try it again need no confirm because they
  lose nothing (parking is reversible, skipping writes nothing, a retry keeps the history). (Audit
  asked for by the owner after the first real session, 5 September 2026.)

## 2. Layout and alignment

- **Controls in a row share the 48px height and one baseline.** Measure, do not eyeball. (Caught: 42/39/56px in one row.)
- **Rows of mixed content align**: status, then action, in the same order and position on every row of a list.
- **No stranded elements.** The `justify-content: space-between` + `flex-direction: column` combination dumps spare height between content and controls at phone widths. Search for the pattern, not the instance. (Caught: buttons floating far below a progress bar.)
- **Figures compose like a printed exam paper**: labels on one baseline, shapes top-aligned in uniform cells, equal gutters, compact. Scattered floating shapes fail. (Caught: the A/B/C/D cube nets.)
- **Everything the user needs to answer fits on one screen**: figure, question, input, and the action, with no scrolling to find the question. Verify by measuring scrollHeight vs clientHeight, which caught an overflow eyeballing missed.
- Nothing clipped at the right edge; nothing truncated mid-word. (Caught: "Switch p", "LOCKE" on iPad portrait.)
- **A quiet button under a line of text starts where the text starts.** A quiet button keeps its horizontal padding, so its label sits indented under the hint above it and the pair reads as misaligned inside the card. Zero the side padding on that button. (Caught: "Stuck, come back later" under "Stuck on this step?", week one on the owner's device.)
- **The control that unlocks the next action sits above that action, never below a panel.** The what-you-tried box that wakes the third try sat under the hint and the timer; the child saw a disabled Check and stopped. Put the gate directly above the button it gates, and let the button say why it is asleep. (Caught: "not able to try for the answer in third try", week one.)

## 3. Figures and images

- **The figure must agree with its own words.** "Three bars each cut in half" drawn as one six-cell grid teaches the wrong thing confidently. (Caught on the lesson prototype.)
- **The figure must not leak the answer** the words withheld.
- Legible at 390px: countable cells, readable labels.
- **Shown versus imagined is a deliberate choice**: drawn options on first meeting, word-only with a "sketch it on graph paper" invitation on mistake-box review. Never accidental prose walls.
- A missing image is a console 404 and a broken promise; assets referenced must exist. (Caught: portfolio photo.)

## 4. Copy

- No em dashes, no arrow characters, sentence case.
- Red text and red chips mean something is wrong. A neutral fact ("New", "Needed by week 3") never wears the destructive colour pair. (Caught: shopping chips read as alarms.)
- Labels tell the truth: "About 92 minutes, estimated from steps completed" not "time spent". Honest and soft beats precise-sounding and wrong.
- Nothing a child might read may sting: no scores framed as shortfalls, no "you forgot", no comparison between siblings. Read it aloud as the child before shipping.
- The same action is worded identically everywhere it appears.

## 5. Sprout (the 3-year-old)

Absolute, no exceptions: **nothing readable required, nothing failable, no dead ends, everything spoken.**

- Every tappable thing visibly tappable: persistent borders on cards, never relying on glyph contrast. A working button that looks inert is a dead end in practice. (Caught: the pause card.)
- **One tap answers.** Auto-speak on open plus a replay control covers re-hearing. Two-tap commit confused a real child.
- The question material and the answer choices are visually separate regions. (Caught: pattern cards tapped instead of choices.)
- Tap targets stay large; never shrink them to fit a layout.
- Landscape is primary (iPad); portrait and phone must still hold together.
- Wrong answers speak what happened and what to try, escalating with more help, never the same line forever, never a buzzer.

## 6. Devices and viewports

Test at all of: 1280x900, 820x1180, 1194x834 (iPad landscape), 834x1194 and 1024x1366 (iPad portrait), 390x844 (phone). 1024 portrait is the trap: wide enough to engage desktop layouts, too narrow to fit them.

- **The gate runs Chromium; the family uses Safari.** WebKit-only failures the gate cannot see: automatic text-size inflation (fixed with `text-size-adjust`), speech requiring a user gesture, storage partitioned between `web.app` and `firebaseapp.com`. When behaviour differs from a report, suspect the browser before the code.
- Before judging a live-site bug, hard refresh: stale bundles have produced two false alarms.

## 7. Process, for any agent doing UI work

- **Verify by looking.** Open the real screen, screenshot it, and look at the screenshot. Reports that cite screenshots which were never written to disk have happened; write files to the project-root `docs/screenshots/` and confirm they exist.
- Run gates in the foreground and wait. Backgrounding a gate and idling has stalled twenty-three agents.
- Visual baselines: review each diff and accept deliberately, never blanket-accept. A baseline enshrines whatever it shows, including mistakes.
- The environment can lie: confirm the emulator serves `wonderloop-dev` (`curl http://localhost:4300/api/config`) before concluding anything about the app.
- Honest answers beat tidy ones. "This was harmless in practice" and "I did not run that check" are acceptable report lines; implying verification that did not happen is not.

---

*Kept current as defects are found. When the owner catches something new on a real device, it gets a line here with the catch noted, so the list stays earned rather than theoretical.*

---

## 8. The gate can only see what it opens

Added after sixteen shipped Sprout rounds turned out to be unanswerable, on screens the gate had
reported clean for months.

- **A screen behind a gesture is not covered until something performs the gesture.** Every Sprout
  screenshot the gate ever took was the tap-to-start screen: an empty ground with one play button.
  It truthfully reported zero findings on all of them. When a whole area of the app has never
  produced a finding, ask what it is actually photographing.
- **Check that a capture shows the state its label claims.** Two screens whose PNGs are byte
  identical are not two screens. Comparing file sizes caught this in seconds.
- **Wait for the state, never for a duration.** The round arrives 550ms after the tap and the
  settle pause was 400ms, so the capture beat the content by 150ms and looked deliberate.
- **A test double belongs where the environment genuinely cannot answer** (headless has no voices),
  and its comment should say what it therefore cannot prove. It does not replace the real-device
  check in the owner checklist.
- **A new screen needs adding to the visual targets, not just the route list**, or it is captured
  and never compared.
- Where a question's whole content is a quantity or a size, the thing that distinguishes the
  choices must reach the child through both channels: drawn, and spoken. Neither alone is enough
  for a child who cannot read.
- **The question material is never a choice.** If a round must show something to be counted or
  matched, it gets the flat dashed strip, never a card among the answers.
