# Deploying Wonderloop

Wonderloop is a Next.js app with a Firebase backend (Google sign-in, Firestore, Cloud Storage).
The app itself can run anywhere Node 22 runs; only the data lives in Firebase, and for a fully
local setup the Firebase emulators stand in for it. Nothing in the code is tied to a particular
project: every identifier comes from environment variables (`web/.env.local.example` lists them).

There are three ways to run it. Pick one.

## A. Fully local, nothing in the cloud

Docker only. The compose file runs the Firebase emulator suite and the app together.

```
docker compose up --build
docker compose run --rm seed        # optional: a demo household with sample progress
```

Open http://localhost:3000. Sign-in on the emulator accepts any made-up Google account; the
seed script allowlists its own demo parent, and you can allowlist an address yourself:

```
docker compose run --rm seed sh -c "npx tsx scripts/allowlist.ts add you@example.com"
```

Without Docker, the same thing from a terminal (Node 22, Java for the emulators, Firebase CLI):

```
cd web && npm install
npm run emulators            # terminal 1
npm run seed                 # once
npm run dev                  # terminal 2, http://localhost:3000
```

Data lives in the emulators and is gone when they stop, which is what you want for trying it.

## B. Your own Firebase project, the app on Firebase Hosting

The way the original runs. One-time setup in the Firebase console:

1. Create a project on the Blaze plan (the hosting function needs it; a family costs well under
   a dollar a month). Enable Authentication with the Google provider, Firestore, and Storage.
2. Put its web config in `web/.env.production.local` (the `NEXT_PUBLIC_*` lines), and set
   `AI_KEY_SECRET` there to a long random string.
3. Point `.firebaserc` at your project id (the `prod` alias), and create the secret the hosting
   function reads:
   `firebase functions:secrets:set AI_KEY_SECRET --project <id>` (paste the same value).
4. Deploy: `cd web && npm run build && npx firebase deploy --project <id> --only hosting,firestore:rules,storage`.
   `npm run build` ends with a check that the hashed firebase-admin alias is declared; read
   `docs/deploy-runbook.md` if it ever fails.
5. Allowlist the first parent: `npx tsx scripts/allowlist.ts add you@example.com --project=<id> --i-mean-it`
   (this needs Application Default Credentials on your machine, or a service account key in
   `GOOGLE_APPLICATION_CREDENTIALS`).

The first sign-in creates the household after the consent screen. Families add their own
Anthropic key in the Parent view if they want the debate opponent.

## C. Your own Firebase project, the app anywhere else

A VPS, a Raspberry Pi, Fly, Render, Vercel, or a home server: the container from the
`Dockerfile` (or `npm run build && npm start` on a plain Node host) with the Firebase project as
the backend.

1. Do steps 1 and 2 of B (project, web config, `AI_KEY_SECRET`), and deploy the rules once:
   `npx firebase deploy --project <id> --only firestore:rules,storage`.
2. Give the server a way to talk to Firestore as an administrator: in the console, Project
   settings, Service accounts, generate a key, and put its JSON (raw or base64) in
   `FIREBASE_SERVICE_ACCOUNT_JSON`. Never commit it.
3. Build with the client config baked in, and run with the server env:

```
docker build -t wonderloop \
  --build-arg NEXT_PUBLIC_USE_EMULATORS=false \
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=... \
  --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<id>.firebaseapp.com \
  --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=<id> \
  --build-arg NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<bucket> .
docker run -p 3000:3000 \
  -e FIREBASE_PROJECT_ID=<id> -e FIREBASE_STORAGE_BUCKET=<bucket> \
  -e FIREBASE_SERVICE_ACCOUNT_JSON="$(base64 -w0 key.json)" \
  -e AI_KEY_SECRET=<the same value as in the console> wonderloop
```

4. Add your app's domain to Authentication, Settings, Authorized domains, or Google sign-in
   will refuse the popup.

On Vercel or similar, set the same variables in the project settings and let it run
`npm run build` in `web/`; no Dockerfile needed. `NEXT_OUTPUT` stays unset there.

## What is the same everywhere

- The security boundary is `firestore.rules` and `storage.rules`, not the host: one household
  never sees another, and a family's AI key is readable by nothing but the server.
- Content is validated and bundled at build time (`npm run validate:content`,
  `npm run generate:content`); changing a JSON file and rebuilding is the whole content deploy.
- The gates before a change ships are the same on every path: `npm test`, `npm run test:rules`
  (against the emulators), `npx tsc --noEmit`, `npx eslint .`, and `npm run verify:ui`.
