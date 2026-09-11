import path from "node:path";
import type { NextConfig } from "next";

const standalone = process.env.NEXT_OUTPUT === "standalone";

const nextConfig: NextConfig = {
  // firebase-admin must be required by its real name at runtime, not bundled.
  // It loads native and optional dependencies and is only ever used from
  // scripts, not from the app itself, so it is never safe to bundle.
  serverExternalPackages: ["firebase-admin"],
  // A self-contained server for containers and plain Node hosts (Dockerfile at the repo root
  // sets NEXT_OUTPUT=standalone). Left unset for Firebase's framework-aware hosting, which
  // packages the build its own way.
  output: standalone ? "standalone" : undefined,
  // The standalone server is traced from the repository root so the content directory beside
  // the app is in scope; the Dockerfile copies web/server.js from that layout.
  outputFileTracingRoot: standalone ? path.join(__dirname, "..") : undefined,
};

export default nextConfig;
