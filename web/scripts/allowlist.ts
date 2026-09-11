// Owner-managed allowlist administration (Task 3b): add, remove and list allowedEmails
// documents. No client ever writes this collection -- firestore.rules denies every client
// write outright (see the allowedEmails match block) -- so this script (or the Firebase
// console, by hand) is the only way in.
//
// Uses firebase-admin via lib/firebase/admin.ts's getAdminDb(), the same helper
// scripts/seed-emulators.ts and scripts/bootstrap-household.ts use, so writes bypass
// firestore.rules the way an owner-run script is supposed to. getAdminDb() already knows how to
// target either the emulator (FIRESTORE_EMULATOR_HOST set, no credentials needed) or a real
// project (Application Default Credentials, an explicit project id).
//
// Unlike bootstrap-household.ts, this script is meant to run against the emulator too --
// scripts/seed-emulators.ts's own allowedEmails write covers ordinary local dev, but this is
// how a developer adds a second local test address by hand. Against a real project it refuses
// to run without an explicit --i-mean-it, mirroring bootstrap-household.ts's convention, since
// this script can grant or revoke access to the owner's real billing account.
//
// Usage:
//   tsx scripts/allowlist.ts add <email> [--note="..."] [--project=<id>] [--i-mean-it]
//   tsx scripts/allowlist.ts remove <email> [--project=<id>] [--i-mean-it]
//   tsx scripts/allowlist.ts list [--project=<id>] [--i-mean-it]

import { EMULATOR_PORTS } from "../lib/firebase/emulator-ports.mjs";

const args = new Map<string, string>();
const positional: string[] = [];
for (const a of process.argv.slice(2)) {
  if (a.startsWith("--")) {
    const [k, v] = a.slice(2).split("=");
    args.set(k, v ?? "true");
  } else {
    positional.push(a);
  }
}

const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
if (!emulated && !args.has("i-mean-it")) {
  console.error(
    "Refusing: pass --i-mean-it to run against a real project (FIRESTORE_EMULATOR_HOST is not " +
      `set). Run against the emulator for local testing (FIRESTORE_EMULATOR_HOST=localhost:${EMULATOR_PORTS.firestore}), ` +
      "or add --i-mean-it --project=<id> for a real project.",
  );
  process.exit(1);
}

// getAdminDb() (lib/firebase/admin.ts) reads FIREBASE_PROJECT_ID itself when not emulated;
// --project is this script's own way of setting that for a one-off invocation.
if (args.has("project")) process.env.FIREBASE_PROJECT_ID = args.get("project");

const VALID_COMMANDS = ["add", "remove", "list"] as const;
type Command = (typeof VALID_COMMANDS)[number];

function usageAndExit(): never {
  console.error(
    'Usage: tsx scripts/allowlist.ts <add|remove|list> [email] [--note="..."] [--project=<id>] [--i-mean-it]',
  );
  process.exit(1);
}

const command = positional[0];
if (!command || !(VALID_COMMANDS as readonly string[]).includes(command)) usageAndExit();

async function main() {
  // Imported after the refusal checks above, and after --project has already set
  // FIREBASE_PROJECT_ID, so getAdminDb() never initializes an app pointed at the wrong project.
  const { getAdminDb } = await import("../lib/firebase/admin");
  const db = getAdminDb();

  if (command === "list") {
    const snap = await db.collection("allowedEmails").get();
    if (snap.empty) {
      console.log("allowedEmails is empty.");
      return;
    }
    console.log(`allowedEmails (${snap.size}):`);
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const addedAt = typeof data.addedAt === "number" ? new Date(data.addedAt).toISOString() : "unknown";
      console.log(`  ${docSnap.id}${data.note ? ` -- ${data.note}` : ""} (added ${addedAt})`);
    }
    return;
  }

  const emailArg = positional[1];
  if (!emailArg) usageAndExit();
  const email = emailArg.trim().toLowerCase();
  if (!email.includes("@")) {
    console.error(`Refusing: "${emailArg}" does not look like an email address.`);
    process.exit(1);
  }

  if (command === "add") {
    const note = args.get("note") ?? "";
    await db.doc(`allowedEmails/${email}`).set({ note, addedAt: Date.now() });
    console.log(`Added ${email} to allowedEmails.`);
    return;
  }

  // command === "remove"
  await db.doc(`allowedEmails/${email}`).delete();
  console.log(`Removed ${email} from allowedEmails.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
