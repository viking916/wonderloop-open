// Creates the real family's household in production Firestore: one household, three profiles
// (parent, explorer, sprout) and the users/{uid} link the app reads to find it. Production-only,
// deliberately awkward to run, and the opposite of seed-emulators.ts in every way that matters:
//
//   - seed-emulators.ts refuses to run unless FIRESTORE_EMULATOR_HOST is set (emulator-only).
//     This script refuses to run if FIRESTORE_EMULATOR_HOST is set (production-only), and also
//     refuses unless --i-mean-it is passed. The two refusals cannot both be satisfied by
//     accident, so this script can never be confused with the dev seed.
//   - seed-emulators.ts writes a full week of fabricated progress, an artifact, a log, attempts,
//     a review-queue item and skills, so local dev has something to look at. This script writes
//     nothing but the household, the three profiles and the user link: a real child's record
//     starts empty. No progress/, attempts/, logs/, artifacts/, skills/ or reviewQueue/ docs.
//
// Document shapes are taken from web/lib/data/types.ts (the authority: HouseholdDoc, ProfileDoc,
// UserDoc) and cross-checked against how the real app writes them (web/lib/data/households.ts's
// createHousehold/createProfile) and how seed-emulators.ts seeds them, so this script does not
// fork either. In particular:
//   - households.ts's createHousehold uses hid = `home-${uid}` for the bootstrap household and
//     writes users/{uid} with only { householdIds: [...] } (merge: true), deliberately never
//     requiring UserDoc's displayName to already exist -- this script matches that, not
//     seed-emulators.ts's extra displayName field.
//   - ProfileDoc requires seasonId, startDate ("YYYY-MM-DD", the Monday the season starts) and
//     look ("trail" is the default look everywhere else in the app).
//
// Idempotent: every id is fixed (hid = home-${owner}, profile ids parent/explorer/sprout), and
// each write is skipped with a message when the document already exists, so running this twice
// creates nothing new the second time.
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const [k, v] = a.split("=");
  args.set(k.replace(/^--/, ""), v ?? "true");
}

if (!args.has("i-mean-it")) {
  console.error("Refusing: pass --i-mean-it. This writes to a real project.");
  process.exit(1);
}
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Refusing: FIRESTORE_EMULATOR_HOST is set. This script is for production only.");
  process.exit(1);
}
const projectId = args.get("project");
const ownerUid = args.get("owner");
const startDate = args.get("start");
if (!projectId || !ownerUid || !startDate) {
  console.error("Usage: --i-mean-it --project=<id> --owner=<uid> --start=YYYY-MM-DD [--explorer=Name] [--sprout=Name]");
  process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
  console.error(`Refusing: --start must be YYYY-MM-DD, got ${startDate}`);
  process.exit(1);
}

const app = initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app);
const hid = `home-${ownerUid}`;

async function main() {
  const hRef = db.doc(`households/${hid}`);
  const existing = await hRef.get();
  if (existing.exists) {
    console.log(`household ${hid} already exists, leaving it alone`);
  } else {
    await hRef.set({
      name: "Home",
      ownerUid,
      memberUids: [ownerUid],
      inviteCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
      createdAt: Date.now(),
    });
    console.log(`created households/${hid}`);
  }

  const profiles = [
    { pid: "parent", name: "Parent", kind: "parent", avatar: "owl", birthYear: 1985 },
    { pid: "explorer", name: args.get("explorer") ?? "Explorer", kind: "explorer", avatar: "fox", birthYear: 2017 },
    { pid: "sprout", name: args.get("sprout") ?? "Sprout", kind: "sprout", avatar: "rabbit", birthYear: 2023 },
  ];
  for (const p of profiles) {
    const ref = db.doc(`households/${hid}/profiles/${p.pid}`);
    if ((await ref.get()).exists) {
      console.log(`profile ${p.pid} already exists, leaving it alone`);
      continue;
    }
    await ref.set({
      name: p.name, kind: p.kind, avatar: p.avatar, birthYear: p.birthYear,
      seasonId: 1, startDate, look: "trail",
    });
    console.log(`created profile ${p.pid} (${p.name}) starting ${startDate}`);
  }

  await db.doc(`users/${ownerUid}`).set({ householdIds: [hid] }, { merge: true });
  console.log(`linked users/${ownerUid} to ${hid}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
