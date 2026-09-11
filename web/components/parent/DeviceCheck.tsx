"use client";

import { useState } from "react";
import { deleteObject, ref as storageRef, uploadString } from "firebase/storage";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getDb, getStorageBucket } from "@/lib/firebase/client";

export type DeviceCheckProps = {
  householdId: string;
  /** The profile the test writes under: any child profile in the household. */
  profileId: string;
};

type Result = { ok: boolean; detail: string };

function describe(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as { code?: unknown; message?: unknown; name?: unknown };
    const code = typeof e.code === "string" ? e.code : typeof e.name === "string" ? e.name : "";
    const message = typeof e.message === "string" ? e.message : "";
    return [code, message].filter(Boolean).join(": ") || String(err);
  }
  return String(err);
}

/**
 * "Check this device" (7 September 2026): the first real week reported saves that did not go
 * through and a camera that would not take a picture, on a device this laptop cannot reproduce.
 * Three buttons run the three things a quest step actually does, on the device in the parent's
 * hand, and print the exact error code if one fails: a tiny Firestore write under the profile,
 * a tiny Storage upload under the profile's artifacts folder (both deleted again), and a camera
 * open. The error code is what to send back; nothing here is stored.
 */
export function DeviceCheck({ householdId, profileId }: DeviceCheckProps) {
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState<string | undefined>(undefined);

  async function run(name: string, test: () => Promise<string>) {
    setBusy(name);
    try {
      const detail = await test();
      setResults((prev) => ({ ...prev, [name]: { ok: true, detail } }));
    } catch (err) {
      setResults((prev) => ({ ...prev, [name]: { ok: false, detail: describe(err) } }));
    } finally {
      setBusy(undefined);
    }
  }

  const testFirestore = () =>
    run("save", async () => {
      const db = getDb();
      const ref = doc(db, "households", householdId, "profiles", profileId, "workings", "device-check");
      await setDoc(ref, { text: "device check", at: Date.now() });
      await deleteDoc(ref);
      return "A note saved and was removed again.";
    });

  const testStorage = () =>
    run("upload", async () => {
      const path = `households/${householdId}/profiles/${profileId}/artifacts/device-check.txt`;
      const fileRef = storageRef(getStorageBucket(), path);
      await uploadString(fileRef, "device check", "raw", { contentType: "text/plain" });
      await deleteObject(fileRef);
      return `A file uploaded to ${getStorageBucket().app.options.storageBucket ?? "the bucket"} and was removed again.`;
    });

  const testCamera = () =>
    run("camera", async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) throw new Error("This browser offers no camera here.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      const label = stream.getVideoTracks()[0]?.label ?? "a camera";
      for (const t of stream.getTracks()) t.stop();
      return `The camera opened (${label}).`;
    });

  const rows: Array<[string, string, () => void]> = [
    ["save", "Test a save", testFirestore],
    ["upload", "Test a photo upload", testStorage],
    ["camera", "Test the camera", testCamera],
  ];

  return (
    <Card tone="surface" className="pr-device-check" aria-labelledby="device-check-heading">
      <p className="tr-eyebrow" id="device-check-heading">
        Check this device
      </p>
      <p className="pr-device-check__intro">
        If a step would not save or the camera would not open, run these here, on the same device, and send back the
        line that shows. Each test writes a tiny thing and removes it again.
      </p>
      <ul className="pr-device-check__rows">
        {rows.map(([key, label, fn]) => (
          <li key={key}>
            <Button variant="secondary" onClick={fn} disabled={busy !== undefined}>
              {busy === key ? "Testing…" : label}
            </Button>
            {results[key] ? (
              <span className={results[key].ok ? "pr-device-check__ok" : "pr-device-check__fail"} role="status">
                {results[key].ok ? "Worked. " : "Failed. "}
                {results[key].detail}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
