# Box setup for the OS builder (run once, on Drake's box)

This is the prompt to hand the agent on the box (or follow by hand). It turns on the builder that `/os` → **Build** → "Start a build" feeds. Read `docs/os/BUILDER.md` and `docs/os/TRUST.md` first.

Two steps need Osman at the keyboard: the two logins (they open a browser sign-in), and copying the KV settings from Vercel. Never paste a key or token into chat, a commit or a log.

---

## Prompt

```
You are setting up the LAVAALL OS builder runner on this box. Follow these steps exactly, report each
result, and stop at the first failure. Never print, log or commit a secret. Do not merge, deploy, change
DNS, or change any Vercel or GitHub setting.

1. Check the tools exist and print their versions: git, node (20 or newer), gh, codex, claude.
   If one is missing, stop and say which.
2. Check GitHub: `gh auth status` must show osman-jalloh-lab with repo scope. If not, stop and ask Osman
   to run `gh auth login`.
3. Ask Osman to log in to both builders here (each opens a browser sign-in; Osman does it, not you):
     codex login
     claude        (then type /login, finish in the browser, then /exit)
   Then confirm both login files exist WITHOUT printing them:
     test -s ~/.codex/auth.json && echo codex-ok
     test -s ~/.claude/.credentials.json && echo claude-ok
4. Get a fresh copy of the repo:
     git clone https://github.com/osman-jalloh-lab/Lavaal-.git ~/lavaall-runner && cd ~/lavaall-runner
5. Create ~/.lavaall-runner.env with mode 600. Osman pastes the two KV values himself from Vercel
   (project lavaal → Settings → Environment Variables → KV_REST_API_URL and KV_REST_API_TOKEN).
   Do not read them back out. The file must contain:
     KV_REST_API_URL=<Osman pastes>
     KV_REST_API_TOKEN=<Osman pastes>
     OS_BUILDER_MONTHLY_CAP_USD=50
     OS_RUNNER_STOP_FILE=$HOME/.os-runner-stop
     # OS_RUNNER_ENABLED stays unset until step 8.
   Do NOT set VERCEL_ENV (the runner must read the same approvals as the live OS).
6. Dry run, nothing pushed, in a throwaway copy:
     git clone https://github.com/osman-jalloh-lab/Lavaal-.git /tmp/os-dryrun && cd /tmp/os-dryrun
     git switch -c os-build/dry-run
     codex exec --sandbox workspace-write "Add one sentence to the end of docs/os/BUILDER.md saying the first dry run was done. Change nothing else."
     node tests/run-safe-suite.js
     git diff --stat
   Expect: one file changed, every test passing. Then: git checkout -- . 
     claude -p "Add one sentence to the end of docs/os/BOX-SETUP.md saying the Claude dry run was done. Change nothing else." --model sonnet --permission-mode acceptEdits --allowedTools "Read,Edit,Write,Glob,Grep" --disallowedTools "Bash,WebFetch,WebSearch"
     git diff --stat
   Expect: one file changed. Then: cd ~ && rm -rf /tmp/os-dryrun
7. Check the runner refuses while off:
     cd ~/lavaall-runner && set -a && . ~/.lavaall-runner.env && set +a && node scripts/os-runner/index.js tick
   Expect: {"state":"disabled",...}
8. Ask Osman to queue one small job on lavaall.com/os → Build → Start a build
   (builder: Codex, task: "Add one sentence to docs/os/BUILDER.md noting the first builder run").
   Then turn the runner on for one tick only:
     OS_RUNNER_ENABLED=1 node scripts/os-runner/index.js tick
   Expect: {"state":"draft_opened", ... "prUrl":"https://github.com/osman-jalloh-lab/Lavaal-/pull/..."}.
   Report the PR link. Do not merge it.
9. Leave the runner OFF: do not add OS_RUNNER_ENABLED to the env file, and do not schedule tick, until
   Osman says so.

Report: tool versions, both logins ok (yes/no, never the contents), dry-run results, the tick results,
and the draft PR link.
```

---

## After the first good run

When Osman wants it to run on its own, schedule `tick` every minute with `OS_RUNNER_ENABLED=1`. Starting it up to three times a minute lets Codex, Claude Sonnet and Claude Opus each work on a job at once (each builder has its own lock). To stop it at once: `touch ~/.os-runner-stop`.
