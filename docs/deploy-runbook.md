# Deploy runbook

This is the reference for running Wonderloop in production (`wonderloop-3d9d5`): what protects
the family's data, and what to do if something breaks.

---

## If you are here because something went wrong

Read this section first. It is written for a parent, not an engineer.

**Nothing is lost by waiting.** Firestore keeps every write for one hour by itself
(`versionRetentionPeriod`), and once daily backups are turned on (see below), you have a copy
from every day going back at least a week. Slow down before you run anything.

**If the app looks broken or empty:**
1. Do not delete anything, do not run any script, do not click "reset."
2. Check `https://console.firebase.google.com/project/wonderloop-3d9d5/firestore/databases/-default-/data`
   and look for the `households` collection. If the data is still there, the problem is probably
   in the app, not the database, and no restore is needed.
3. If data is genuinely missing, go to **Restore from a backup**, below.

**If you are not sure whether you need to restore:** it is always safe to look (read-only) at
`https://console.firebase.google.com/project/wonderloop-3d9d5/firestore/backups`. Looking at a
backup does not touch production.

---

## Backups: what protects the data today

Firestore protects against hardware failure automatically. It does **not** protect against
deletion: a bad script, a reset run at the wrong scope, or a mistake in the console. That is
what backups are for.

**Mechanism:** Firestore's own scheduled backups (Firestore Standard edition includes this;
`wonderloop-3d9d5`'s `(default)` database is Standard edition, confirmed 2026-08-30). This is a
fully managed feature, not a script or a Cloud Function: Firestore itself takes a consistent
snapshot of the whole database on a schedule and keeps it for a fixed retention window. There is
nothing to run, host, or monitor.

**Status as of 2026-08-30: not yet turned on.** The Firebase Admin SDK service account used for
day-to-day scripts (`firebase-adminsdk-fbsvc@wonderloop-3d9d5.iam.gserviceaccount.com`) only has
data read/write permissions (it is scoped for the app's own use, correctly). Creating a backup
schedule, restoring from one, exporting to Cloud Storage, and even flipping the database's own
delete-protection switch are all account-administration actions that this key cannot perform and
should not be granted, since that key sits on a laptop, not in a vault. **This needs the owner,
signed in with the Google account that created the project, to click a few buttons once.** See
the owner checklist below; it takes about two minutes and is the single most important thing
left before Friday.

Once turned on, the plan is:
- **Frequency:** daily.
- **Retention:** 7 days (enough to catch a mistake noticed within a week; a family app doesn't
  need bank-grade retention).
- **Where it lands:** inside Firestore's own managed backup storage for the project, visible and
  restorable from `https://console.firebase.google.com/project/wonderloop-3d9d5/firestore/backups`.
  Nothing to configure in Cloud Storage for this path.

A secondary Cloud Storage bucket, `gs://wonderloop-3d9d5-firestore-backups`, was also created (US
multi-region, 30-day auto-delete lifecycle already applied) in case the owner ever wants a
one-off manual export (`gcloud firestore export gs://wonderloop-3d9d5-firestore-backups/<name>`)
in addition to the managed schedule. It is empty today and not required for the daily schedule
above.

---

## Restore: what was actually proven, and how to do it for real

**An untested backup is not a backup**, so this was tested end to end before anything shipped,
using a completely isolated throwaway copy of Firestore rather than touching `wonderloop-3d9d5`
in any way (the rules for this work forbid writing to or restoring over the production project,
and no real backup exists yet to restore from regardless, per the status above).

**What was done (2026-08-30):**
1. Started an isolated, disposable Firestore emulator (`wonderloop-restore-test-src`, a made-up
   project id, port 8091, not the shared dev emulator on 8080) and seeded it with the repo's own
   `web/scripts/seed-emulators.ts`, which produces realistic household data in the exact shape
   the real app writes: a household, three profiles, Maker's Log entries (`logs`), finished-work
   photo records (`artifacts`), problem attempts, review-queue items, and skill levels. 30
   documents.
2. Exported it with `firebase emulators:export` (the same export/import format used by
   `gcloud firestore export`/`import` against a real project).
3. Started a second, separate isolated emulator (`wonderloop-restore-test-dst`, port 8092) and
   imported that export into it fresh.
4. Verified by reading the restored data back with the Admin SDK: every collection's document
   count matched the seed exactly (1 household, 3 profiles, 1 artifact, 1 log, 13 attempts, 4
   skills, 2 progress docs), and the content of a Maker's Log entry came back byte-for-byte,
   including the child's own written answers:
   > "A micro:bit badge that scrolls my name and shows a heart, then my own picture on button
   > A." ... "Next time I would test on the battery pack sooner instead of only over USB."
5. Tore down both throwaway emulators (confirmed by process id, distinct from the real dev
   emulators' process ids, which were never touched) and deleted the scratch export.

This proves the mechanism Firestore's managed export/import and backup/restore both rely on
works, and that data comes back intact rather than truncated or corrupted. It does not yet prove
a restore from a *real* daily backup of `wonderloop-3d9d5`, because none exists until the owner
turns the schedule on (above). Once the first real backup exists, repeat the drill once for real
confidence: restore it into a **new, separate Firestore database inside `wonderloop-3d9d5`**
(Firestore supports more than one database per project; a second database named e.g.
`restore-drill` is not the `(default)` database the app reads from, so this cannot affect the
live app) or into a throwaway project, confirm the data, then delete that test database. Never
restore over `(default)`.

### How to restore for real, if it is ever needed

1. Go to `https://console.firebase.google.com/project/wonderloop-3d9d5/firestore/backups`.
2. Pick the backup from the day before the data went missing (there is one for each of the last
   7 days).
3. Choose **Restore**. It will ask for a **destination database name** — this is the safety
   catch. Restoring always creates a **new** database; it never overwrites the live one.
   - If you are checking that a backup is good: type a throwaway name like `restore-check`,
     confirm the data looks right in the console's data viewer, then delete that database when
     done (Firestore, Databases, the three-dot menu, Delete).
   - If the live database really needs to be replaced (rare — this means something already
     deleted the real data): restore to a new name first, confirm it looks right, and only then
     change the app to point at the new database name, or contact whoever set this up before
     doing anything further. Do not delete `(default)` to "make room."
4. Restores typically take a few minutes for a database this size.

---

## Billing budget alert

**Status as of 2026-08-30: not set.** This is a billing-account-level setting, not a project
setting, so it needs whoever's card is on the account, not a service account key. It cannot be
delegated to automation from this laptop.

**Owner: create it here**, `https://console.cloud.google.com/billing/budgets`, project
`wonderloop-3d9d5` (or Console, hamburger menu, Billing, Budgets & alerts):
1. **Create budget.**
2. Scope: this project (`wonderloop-3d9d5`).
3. Amount: a small number that would only be reached by something going wrong, e.g. $10/month.
   A family app on Blaze with light traffic should cost well under a dollar most months.
4. Alert thresholds: keep the defaults (50%, 90%, 100%) or tighten them; the point is just to
   get an email early.
5. Save. No action is taken automatically at any threshold; it only sends email to the billing
   account's admins. That's the point: a human notices, nothing shuts off mid-use.

---

## Build image cleanup (the known loose end)

The first hosting deploy's Cloud Functions build warned it could not clean up its intermediate
build images. Checked 2026-08-30: these live in Artifact Registry (the legacy `gcr.io` UI at
`console.cloud.google.com/gcr/images/...` redirects here now), not the old Container Registry —
`https://console.cloud.google.com/artifacts/docker/wonderloop-3d9d5/us-central1/gcf-artifacts`.

Found one repository, `gcf-artifacts`, **about 5 GB**, holding 4 image builds from the last two
deploys. Two are tagged `latest` / `version_1` and are the currently-deployed function and its
build cache — **do not delete those**. The other **3 are stale, untagged builds from earlier
deploys and are safe to delete**; at roughly $0.10/GB/month for Artifact Registry storage this is
about $0.50/month of pure waste, not urgent but easy to fix.

The Admin SDK service account has `roles/cloudfunctions.admin` but not
`artifactregistry.versions.delete`, so it cannot clean these up (confirmed 2026-08-30,
`PERMISSION_DENIED` on `artifactregistry.versions.delete`). **Owner: run this once, signed in
with the account that owns the project** (Cloud Shell at
`https://console.cloud.google.com/cloudshell` is the easiest place — no local setup):

```
gcloud artifacts docker images list \
  us-central1-docker.pkg.dev/wonderloop-3d9d5/gcf-artifacts \
  --include-tags --format="value(IMAGE,DIGEST,TAGS)"
```

Delete every digest whose TAGS column is empty (leave anything tagged `latest` or `version_N`
alone):

```
gcloud artifacts docker images delete \
  "us-central1-docker.pkg.dev/wonderloop-3d9d5/gcf-artifacts/<package>@<digest>" --quiet
```

To stop this from recurring, add a cleanup policy to the repository (deletes untagged images
older than a few days automatically):

```
gcloud artifacts repositories set-cleanup-policies gcf-artifacts \
  --project=wonderloop-3d9d5 --location=us-central1 \
  --policy=<a JSON file with a "delete untagged, older than N days" rule>
```
(`gcloud artifacts repositories set-cleanup-policies --help` documents the JSON shape; this
step is optional, the manual delete above already stops the bleeding for now.)

---

## Owner checklist: things only you can do

None of these can be done from an automated script or a service account key on a laptop; each
needs your own Google account, which is the correct security boundary (see above). All are quick.

1. **Turn on daily Firestore backups.** Console: Firestore, **Backups** tab,
   `https://console.firebase.google.com/project/wonderloop-3d9d5/firestore/databases/-default-/backups`.
   Create a backup schedule on the `(default)` database: daily, 7-day retention. Two minutes.
2. **Turn on delete protection** on the same database while you're there (Firestore, `(default)`
   database, Edit): a second, independent safeguard against ever running a delete against the
   whole database by accident. Free, no downside for an app this size.
3. **Set the billing budget alert.** See "Billing budget alert" above for the exact steps and
   URL.
4. **Clean up the stale build images.** See "Build image cleanup" above; optional but easy money
   saved, and the cleanup policy stops it recurring.
5. Once the first daily backup exists (give it a day), do one real restore drill: restore it
   into a new database named `restore-drill` inside `wonderloop-3d9d5` (see "How to restore for
   real" above), confirm the data, then delete that database. This closes the loop on the actual
   production backup, not just the mechanism test recorded above.

---

## Other hosts, and fully local

This runbook is the Firebase Hosting path. `docs/DEPLOYMENT.md` covers the two others: the
app as a container on any host with your own Firebase project behind it (`Dockerfile`, a
service account key in `FIREBASE_SERVICE_ACCOUNT_JSON`), and a fully local stack with the
Firebase emulators (`docker compose up`, `firebase.docker.json`). Both were run end to end on
6 September 2026.

## The public repository

`https://github.com/viking916/wonderloop-open` is a public snapshot, not a mirror: one commit,
no history, rebuilt by `bash scripts/publish-public.sh` (which runs `scripts/export-public.mjs`
and force-pushes main). Since 6 September 2026 `scripts/push-github.sh` runs it after every
push, so the private and public repositories carry the same code and content. The export leaves
out the owner's family documents (owner questions and checklist, the reviews, the authoring
status log, the deferred-items list), the plans and specs, the design mockups, the local skill
file, the agent notes Next.js writes into web/ (AGENTS.md, CLAUDE.md), the task-numbered
screenshot scripts, the screenshot archive and the two publish scripts;
it replaces the family details that remain with neutral words and refuses to export if any
survive. Code is MIT
(`LICENSE`), content is CC BY-NC-SA 4.0 (`LICENSE-CONTENT.md`). First published 6 September 2026.

## The hashed firebase-admin alias (read before touching dependencies)

Turbopack (Next 16) externalises `firebase-admin` (next.config.ts, `serverExternalPackages`)
under a hashed alias, `firebase-admin-a14c8a5423a75469`, and satisfies it locally with an
absolute symlink inside `web/.next/node_modules`. That link does not survive the upload to Cloud
Run: on 6 September 2026 every `/api/ai` route answered an empty 500 in production while the
same build ran fine locally, and the only trace was in Cloud Run's stderr ("Cannot find package
'firebase-admin-a14c8a5423a75469'"). The fix is an npm alias dependency in `web/package.json`
(`"firebase-admin-a14c8a5423a75469": "npm:firebase-admin@^14.3.0"`), which the frameworks build
copies into the function's package.json so Cloud installs it. `npm run build` ends with
`scripts/check-externals.mjs`, which fails if a hashed alias appears that package.json does not
declare (the hash changes if the package path or version changes; the check names the new one).
Run `npm run build` before a deploy after any dependency change.

To read Cloud Run's own logs when the Firebase CLI shows nothing useful: `functions:log` only
lists lifecycle events for this gen-2 function. The Logging API does answer with the CLI's own
login; `scripts/cloud-log.mjs` is not written yet, the incantation that worked was a POST to
`https://logging.googleapis.com/v2/entries:list` with a cloud-platform token minted through
`firebase-tools/lib/auth` from the refresh token in `~/.config/configstore/firebase-tools.json`,
filtering `resource.type="cloud_run_revision"` on a time window; the stderr entries carry the
stack.

## AI keys: one per family

Since 6 September 2026 there is no app-wide Anthropic key. Each household supplies its own in
the Parent view ("AI features" card): the key is checked once against Anthropic, then stored at
`households/{hid}/private/ai` (a subtree `firestore.rules` denies to every client; only the
server's Admin SDK reads it, `web/lib/ai/keys.ts`), encrypted with AES-256-GCM under the
Firebase secret `AI_KEY_SECRET`, bound to the hosting function in `firebase.json`. Without a key
the debate room offers "We debated it out loud" and the quest still completes; with one, every
call is billed to that family's own Anthropic account and the per-profile rate limit still
applies.

The secret was created on 6 September 2026 (`firebase functions:secrets:set AI_KEY_SECRET
--project prod --data-file <file>`); the same value sits in the git-ignored
`web/.env.production.local` and a different one in `web/.env.development.local`. Rotating it
would make every stored key unreadable, so do not: families would have to paste their keys
again. A key stored with `enc: "none"` (the secret was unset when it was saved) is read as is.

From the command line (`web/scripts/ai-key.ts`; `find` looks a household up by its owner's
email):

```
npx tsx scripts/ai-key.ts find <owner email> --project=wonderloop-3d9d5 --i-mean-it
npx tsx --env-file=.env.production.local scripts/ai-key.ts set <hid> --project=wonderloop-3d9d5 --i-mean-it
npx tsx scripts/ai-key.ts status <hid> --project=wonderloop-3d9d5 --i-mean-it
```

A deploy check: `curl https://wonderloop-3d9d5.web.app/api/ai/health` answers with the model
name and `perFamilyKeys: true`; with `?hid=` and a member's ID token it says whether that family
has a key.

## Opening the app to another family

1. Add the parent's address: `npx tsx scripts/allowlist.ts add <email> --project=wonderloop-3d9d5 --i-mean-it`.
2. Send them the link. On first sign-in they read the privacy notice and the terms
   (`/privacy`, `/terms`), tick that they are a parent or guardian, and their household is
   created with the accepted version recorded on it (`termsVersion`, `termsAcceptedAt`).
3. They add children in the Parent view. A new child starts season 1; the week clock starts
   on the child's first saved step, whatever the calendar says.
4. If they want the AI opponent, they add their own Anthropic key in the Parent view.

## Deploy and rollback

*(To be filled in alongside Task 4/5 of the deploy plan; this runbook currently covers backups,
restore, and cost protection only.)*

## The auth domain, and why it is not the default

`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is set to **`wonderloop-3d9d5.web.app`**, the app's own hosting domain, and NOT to the `wonderloop-3d9d5.firebaseapp.com` default that the Firebase console hands you.

This is deliberate and it matters. Safari partitions storage between sites, and `web.app` and `firebaseapp.com` are different sites. With the default, signing in bounced from the app to the other domain and back, and the sign-in state Safari had walled off was gone when it returned. On 2026-08-30 an iPad Pro failed with:

> Unable to process request due to missing initial state. This may happen if browser sessionStorage is inaccessible or accidentally cleared.

Chrome and Android were unaffected, which is why nothing caught it until the owner tried a real iPad. Serving the sign-in handler from the app's own domain keeps the whole flow same-origin, so there is nothing to partition. Both domains serve `/__/auth/handler`, so no extra setup is needed.

**This value lives in `web/.env.production.local`, which is git-ignored.** It does not travel with the repository. If this project is ever rebuilt somewhere else and the default is used, the iPad will break again with nothing in the code to explain why.


## The Cloud Function's Node runtime, and how to move it

Framework-aware hosting picks the function's Node runtime from **`engines.node` in
`web/package.json`**. That is the whole lever:

```json
"engines": { "node": "22" }
```

Set on 2026-09-01, taking the deployed function from Node 20 to Node 22. Node 20 was deprecated
2026-04-30 and is decommissioned **2026-10-31**, after which a deploy on it is refused. Season 1
runs to late November, so without this a content fix from about week 8 onward could not have
shipped, and the discovery would have come at the moment it was needed.

**Do not put `runtime` under `hosting.frameworksBackend` in `firebase.json`.** It reads like the
right place and it is not: the deploy fails outright rather than ignoring it, once at the Cloud
Build stage with `INTERNAL_ERROR` and once earlier with a bare "An unexpected error has occurred",
neither naming the cause. A control deploy on the reverted config succeeded immediately, which is
what identified it.

**But that bare "An unexpected error has occurred" is also just flaky.** It appeared again on a
later deploy with no `runtime` key anywhere and `engines.node` correct, and a straight retry with
no changes succeeded. So the message means nothing on its own: **retry once before you go looking**,
and only suspect `firebase.json` if the second attempt fails the same way. Both failures left the live site untouched on its previous version, which is
the one reassuring thing about them: a failed build never replaces what is serving.

Local Node is newer than the pin, so npm may print an EBADENGINE warning. It is a warning; the
suite and the typecheck are clean with the pin in place.
