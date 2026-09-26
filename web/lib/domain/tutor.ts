// Ask's shared, framework-free rule (12 September 2026): the child-message cap both the server
// route (app/api/ai/tutor/route.ts, via lib/ai/tutor.ts) and the client panel
// (components/quest/AskPanel.tsx) need to agree on. Deliberately not in lib/ai/tutor.ts: that
// file starts with `import "server-only"`, which throws the instant it is imported into a
// client bundle (see lib/ai/tutor.test.ts's own comment) -- a plain domain module, the same
// pattern lib/domain/debate.ts already uses for OPPONENT_MAX_WORDS, is what AskPanel can safely
// import directly instead of duplicating the number.

/** After this many child messages, Ask closes the conversation instead of opening a new
 * question: "try it now, then show a grown-up" (spec: never an open-ended chat). Raised from 6
 * to 15 (owner feedback, 25 September 2026: "AI is too strict, going in circles, and has limited
 * asks") once the prompt itself was fixed to stop circling -- see lib/ai/tutor.ts's systemPrompt
 * and docs/superpowers/specs/2026-09-25-builder-ask-prompt.md's "2026-09-25 anti-circling
 * revision" section. A higher cap alone would not have fixed the complaint; the owner's actual
 * problem was replies that asked the same kind of question over and over rather than teaching,
 * which the cap could not touch either way. */
export const MAX_CHILD_MESSAGES = 15;
