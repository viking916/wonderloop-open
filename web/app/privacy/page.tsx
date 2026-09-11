import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Privacy notice, Wonderloop" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice" updated="6 September 2026">
      <p>
        Wonderloop is a small, invitation-only learning app run by one family for other families. This notice says
        what it keeps, where, who can see it, and how to have it removed. It is written to be read, not skimmed.
      </p>
      <h2>What is kept</h2>
      <ul>
        <li>Your Google account&rsquo;s email address and display name, used to sign you in and to name your household.</li>
        <li>Each child&rsquo;s profile: a first name or nickname, a birth year, which season and week they are on.</li>
        <li>Progress: answers, attempts, hints used, checklists ticked, working-space drawings and notes, minutes spent.</li>
        <li>Things a child makes: photos, code, written pieces, audio and video recordings saved on purpose from a quest.</li>
        <li>Debate transcripts and coach cards, only if a parent switches on the AI features for the household.</li>
        <li>A parent&rsquo;s own notes and comments in the Parent view, and which materials were marked bought.</li>
      </ul>
      <h2>Where it lives</h2>
      <p>
        Everything is stored in Google Firebase (Firestore and Cloud Storage) in the United States, in a project the
        app&rsquo;s owner administers. Data is encrypted at rest by Google. The owner can see any household&rsquo;s data as the
        project administrator, and does so only to run the app, fix a problem you report, or remove data at your request.
      </p>
      <h2>Who can see it</h2>
      <p>
        Only the members of your household: the people who signed in with an allowed address or joined with your invite
        code. One household never sees another. Nothing is sold, shared with advertisers, or used to train anything.
      </p>
      <h2>AI features</h2>
      <p>
        The debate room sends the motion, the child&rsquo;s typed or spoken words for that debate, and the child&rsquo;s first name
        to Anthropic&rsquo;s Claude model, using the API key your family supplies in the Parent view. Anthropic&rsquo;s handling of
        that text is governed by its own terms and privacy policy. With no key added, nothing is sent anywhere and the
        AI features stay off. The key itself is kept on the server and never shown again.
      </p>
      <h2>Children</h2>
      <p>
        Children use Wonderloop under a parent&rsquo;s or guardian&rsquo;s account. The parent creates the household, accepts these
        notices, and can see everything a child does here. The app collects nothing from a child beyond what a quest asks
        them to make.
      </p>
      <h2>Your choices</h2>
      <ul>
        <li>Reset a week or a season for a child from the Parent view; it deletes that work and keeps a record of the reset.</li>
        <li>Remove the AI key at any time from the Parent view.</li>
        <li>Ask the owner to delete a profile, a household, or everything about your family. It is done by hand, promptly.</li>
      </ul>
      <p>Questions or removal requests go to the person who invited you; they run the app.</p>
    </LegalPage>
  );
}
