// Owner-managed AI key administration: set, clear or show the status of a household's stored
// Anthropic key from the command line (the Parent view does the same for a family). Reads the
// key from ANTHROPIC_API_KEY in the environment, never from an argument, so it does not land
// in a shell history. Refuses a real project without --i-mean-it, like scripts/allowlist.ts.
//
//   FIRESTORE_EMULATOR_HOST=localhost:8380 tsx --env-file=.env.development.local scripts/ai-key.ts status <hid>
//   tsx --env-file=.env.production.local scripts/ai-key.ts set <hid> --project=wonderloop-3d9d5 --i-mean-it
//   tsx scripts/ai-key.ts find <owner email> --project=wonderloop-3d9d5 --i-mean-it

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
    `Refusing: pass --i-mean-it to run against a real project (FIRESTORE_EMULATOR_HOST is not set; the emulator is localhost:${EMULATOR_PORTS.firestore}).`,
  );
  process.exit(1);
}
if (args.has("project")) process.env.FIREBASE_PROJECT_ID = args.get("project");

async function main() {
  const [command, target] = positional;
  const { getAdminDb } = await import("../lib/firebase/admin");
  const keys = await import("../lib/ai/keys");
  if (command === "find") {
    if (!target) throw new Error("usage: find <owner email>");
    const users = await getAdminDb().collection("users").get();
    const { getAuth } = await import("firebase-admin/auth");
    const { getAdminApp } = await import("../lib/firebase/admin");
    const user = await getAuth(getAdminApp()).getUserByEmail(target);
    const doc = users.docs.find((d) => d.id === user.uid);
    console.log(`uid ${user.uid}; households: ${JSON.stringify(doc?.data()?.householdIds ?? [])}`);
    return;
  }
  if (!target) throw new Error("usage: <status|set|clear> <hid>");
  if (command === "status") {
    console.log(JSON.stringify(await keys.getHouseholdKeyStatus(target)));
  } else if (command === "set") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key || !keys.looksLikeAnthropicKey(key)) throw new Error("ANTHROPIC_API_KEY is not set in the environment or does not look like a key.");
    await keys.setHouseholdKey(target, key, "owner-script");
    console.log(`key set for ${target}: ${JSON.stringify(await keys.getHouseholdKeyStatus(target))}`);
  } else if (command === "clear") {
    await keys.clearHouseholdKey(target);
    console.log(`key cleared for ${target}`);
  } else {
    throw new Error("usage: <status|set|clear|find> ...");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
