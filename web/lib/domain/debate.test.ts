import { describe, expect, it } from "vitest";
import {
  OPPONENT_MAX_WORDS,
  currentRound,
  emptyDebate,
  isDebateComplete,
  opponentReplyProblem,
  opponentSideOf,
  phaseOf,
  transcriptOf,
  withChildTurn,
  withCoachCard,
  withOpponentReply,
  withSide,
  withSteelman,
  withoutPending,
} from "./debate";

const card = { strength: "You gave a real example.", improvement: "Answer their best point first.", ideaName: "Rebuttal" };

describe("debate phases", () => {
  it("starts at side when the step says choose, and at steelman when the side is assigned", () => {
    expect(phaseOf(emptyDebate("m", "Homework should be banned", undefined))).toBe("side");
    expect(phaseOf(emptyDebate("m", "Homework should be banned", "for"))).toBe("steelman");
  });

  it("walks steelman, three rounds, coach, done", () => {
    let s = emptyDebate("m", "Homework should be banned", "for");
    s = withSteelman(s, "Homework helps you practise.", "That is fair.");
    expect(phaseOf(s)).toBe("round1");
    for (const round of [1, 2, 3] as const) {
      expect(currentRound(s)).toBe(round);
      s = withChildTurn(s, `Point ${round}`);
      expect(s.pendingChildText).toBe(`Point ${round}`);
      s = withOpponentReply(s, `Reply ${round}`);
      expect(s.pendingChildText).toBeUndefined();
    }
    expect(phaseOf(s)).toBe("coach");
    expect(currentRound(s)).toBeUndefined();
    s = withCoachCard(s, card);
    expect(phaseOf(s)).toBe("done");
    expect(isDebateComplete(s)).toBe(true);
    expect(s.rounds).toHaveLength(3);
  });

  it("a side, once chosen, does not change", () => {
    const s = withSide(emptyDebate("m", "x", undefined), "against");
    expect(withSide(s, "for").side).toBe("against");
    expect(opponentSideOf("against")).toBe("for");
  });
});

describe("an abandoned round", () => {
  it("keeps the child's words as pending until the opponent answers", () => {
    let s = withSteelman(emptyDebate("m", "x", "for"), "Fair point.", "Good.");
    s = withChildTurn(s, "My first point.");
    // The tab closes here; the state written down still holds his words.
    const resumed = { ...s };
    expect(resumed.pendingChildText).toBe("My first point.");
    expect(phaseOf(resumed)).toBe("round1");
    expect(withOpponentReply(resumed, "Here is mine.").rounds[0]).toEqual({ childText: "My first point.", aiText: "Here is mine." });
  });

  it("can drop the pending words so he can say it differently", () => {
    let s = withSteelman(emptyDebate("m", "x", "for"), "Fair point.", "Good.");
    s = withChildTurn(s, "Wait, not that.");
    expect(withoutPending(s).pendingChildText).toBeUndefined();
    expect(withoutPending(s).rounds).toHaveLength(0);
  });

  it("an opponent reply with nothing pending changes nothing", () => {
    const s = withSteelman(emptyDebate("m", "x", "for"), "Fair point.", "Good.");
    expect(withOpponentReply(s, "Out of turn.")).toEqual(s);
  });

  it("empty words are not a turn, and a turn after round three is refused", () => {
    let s = withSteelman(emptyDebate("m", "x", "for"), "Fair point.", "Good.");
    expect(withChildTurn(s, "   ")).toEqual(s);
    for (let i = 0; i < 3; i++) s = withOpponentReply(withChildTurn(s, `p${i}`), `r${i}`);
    expect(withChildTurn(s, "a fourth").pendingChildText).toBeUndefined();
    expect(withCoachCard(withSteelman(emptyDebate("m", "x", "for"), "a", "b"), card).coachCard).toBeUndefined();
  });
});

describe("transcriptOf", () => {
  it("reads as a plain exchange the parent can follow, pending reply included", () => {
    let s = withSteelman(emptyDebate("m", "Homework should be banned", "for"), "It builds habits.", "Fair.");
    s = withOpponentReply(withChildTurn(s, "Kids need rest."), "Rest matters, and so does practice.");
    s = withChildTurn(s, "Practice can happen at school.");
    const text = transcriptOf(s, "Ravi");
    expect(text).toContain("Motion: Homework should be banned");
    expect(text).toContain("Ravi argues for.");
    expect(text).toContain("Ravi (steelman): It builds habits.");
    expect(text).toContain("Round 1\nRavi: Kids need rest.\nRebut: Rest matters, and so does practice.");
    expect(text).toContain("Round 2\nRavi: Practice can happen at school.\nRebut: (no reply yet)");
  });
});

describe("opponentReplyProblem", () => {
  it("accepts a short point on the motion", () => {
    expect(opponentReplyProblem("Homework is how practice happens at home. Without it, a hard idea from Monday is gone by Friday.")).toBeUndefined();
  });

  it("refuses more than the word cap", () => {
    const long = Array.from({ length: OPPONENT_MAX_WORDS + 1 }, () => "word").join(" ");
    expect(opponentReplyProblem(long)).toBe("too_long");
    const exact = Array.from({ length: OPPONENT_MAX_WORDS }, () => "word").join(" ");
    expect(opponentReplyProblem(exact)).toBeUndefined();
  });

  it("refuses a reply that claims to be a person", () => {
    expect(opponentReplyProblem("When I was a kid I hated homework too.")).toBe("claims_to_be_human");
    expect(opponentReplyProblem("I am a real person, not a robot.")).toBe("claims_to_be_human");
    expect(opponentReplyProblem("My mum always said practice matters.")).toBe("claims_to_be_human");
  });

  it("refuses a reply that asks for personal details", () => {
    expect(opponentReplyProblem("Good point. What is your school called?")).toBe("asks_personal_details");
    expect(opponentReplyProblem("Where do you live, by the way?")).toBe("asks_personal_details");
  });

  it("refuses an empty reply", () => {
    expect(opponentReplyProblem("  ")).toBe("empty");
  });

  it("does not mistake talking about people for claiming to be one", () => {
    expect(opponentReplyProblem("Many kids say homework is boring, but boring is not the same as useless.")).toBeUndefined();
    expect(opponentReplyProblem("I am an AI opponent, and my point is that practice needs repetition.")).toBeUndefined();
  });
});
