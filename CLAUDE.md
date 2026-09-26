# Wonderloop: read this first

Start every session by reading `docs/AGENT-GUIDE.md`. It is the onboarding guide for any agent or
person working on this project: what it is, the repo map, how to run, test, deploy and push, the
content model, the standing owner rules, and the current state of the work.

**This folder is its own git repository**, standalone since 2026-09-13, with its own `.git`,
remote `origin` pointing at `https://github.com/viking916/wonderloop.git`, and branch `main`. Run
every git command from inside this folder; `git rev-parse --show-toplevel` prints this folder,
not `C:\Work`. The parent folder `C:\Work` holds an older repository that no longer tracks this
project at all; never use it for Wonderloop work. See `docs/AGENT-GUIDE.md` section 4 for the full
detail and why the split happened.

Three rules that must never be missed, restated here so they survive a truncated context:

1. No em dashes and no arrow characters anywhere: copy, comments, docs, commit messages.
2. Finish every piece of work by updating the docs it touches (including `docs/AGENT-GUIDE.md`
   when routes, scripts, deploy steps or rules change), committing only the files this session
   changed, pushing with `scripts/push-github.sh` (a plain `git push origin main` from this
   folder, then the public snapshot), and deploying when the change is user-facing.
3. UI work is verified by screenshots you have looked at, never by a green build alone. Load the
   `ui-review` skill before any UI change.

The `web/` folder has its own `CLAUDE.md`, which only carries the Next.js version notice.
