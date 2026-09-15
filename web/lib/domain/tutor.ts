// Ask's shared, framework-free rule (12 September 2026): the child-message cap both the server
// route (app/api/ai/tutor/route.ts, via lib/ai/tutor.ts) and the client panel
// (components/quest/AskPanel.tsx) need to agree on. Deliberately not in lib/ai/tutor.ts: that
// file starts with `import "server-only"`, which throws the instant it is imported into a
// client bundle (see lib/ai/tutor.test.ts's own comment) -- a plain domain module, the same
// pattern lib/domain/debate.ts already uses for OPPONENT_MAX_WORDS, is what AskPanel can safely
// import directly instead of duplicating the number.

/** After this many child messages, Ask closes the conversation instead of opening a new
 * question: "try it now, then show a grown-up" (spec: never an open-ended chat). */
export const MAX_CHILD_MESSAGES = 6;
