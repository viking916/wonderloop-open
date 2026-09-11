import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Terms of use, Wonderloop" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="6 September 2026">
      <p>
        Wonderloop is offered free, by invitation, to families who want to run its weekly quests at home. Using it means
        agreeing to the few points below.
      </p>
      <h2>Who may use it</h2>
      <p>
        An adult parent or guardian creates the household and is responsible for it. Children use the app through that
        household, with the adult&rsquo;s knowledge. Only addresses the owner has allowed can sign in.
      </p>
      <h2>Safety is the parent&rsquo;s call</h2>
      <p>
        The Build quests use real tools: a micro:bit, breadboards, batteries, a soldering iron in later seasons, small
        robots, and a laptop. The instructions include the safety steps the content author knows, but every session
        happens in your home under your supervision, and you decide what your child is ready to handle.
      </p>
      <h2>The AI opponent</h2>
      <p>
        If you add an API key, the debate room&rsquo;s opponent is a language model. It is prompted to argue fairly with a
        child and to coach, and its replies are checked against rules, but it can still be wrong or odd. Read the
        transcripts in the Parent view. Calls are billed to your own Anthropic account under Anthropic&rsquo;s terms.
      </p>
      <h2>What you get, and what you do not</h2>
      <p>
        The app is provided as it is, without warranty, and may change or stop. Content may be corrected or replaced as
        the curriculum improves; a child&rsquo;s saved work stays theirs. The owner may remove access from an address that
        misuses the app or the invite codes.
      </p>
      <h2>Your work</h2>
      <p>
        Everything your children make in the app belongs to your family. The owner will not publish it, and will delete
        it on request, as the privacy notice describes.
      </p>
      <p>These terms are a plain-language agreement between families, not legal advice; if you need more, ask before you start.</p>
    </LegalPage>
  );
}
