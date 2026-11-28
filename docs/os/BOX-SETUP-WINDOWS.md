# Let the OS build on your Windows PC

When this is set up, typing "build me X" on lavaall.com/os → **Build** runs the build here, on your PC:
1. It makes a fresh copy of the repo in a temporary folder.
2. Claude Code or Codex makes the change, using your own logins.
3. The tests run.
4. You get a **draft** pull request.

Nothing is merged or deployed. Questions and research don't need this at all; they're answered on Vercel.

## Once: install the tools
Install these, then open a **new** PowerShell window:
- Git for Windows: https://git-scm.com/download/win
- Node.js 20 or newer (LTS): https://nodejs.org
- GitHub CLI: `winget install GitHub.cli`
- Claude Code: `npm install -g @anthropic-ai/claude-code`
- Codex: `npm install -g @openai/codex`

## Once: log in (each opens a browser)
1. GitHub: run `gh auth login`. Pick GitHub.com, then HTTPS, then log in with a web browser.
2. Claude Code: run `claude`, type `/login`, finish in the browser, then type `/exit`.
3. Codex: run `codex login`.

## Once: run the setup script
In PowerShell:
```
git clone https://github.com/osman-jalloh-lab/Lavaal-.git "$env:USERPROFILE\lavaall-runner"
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\lavaall-runner\scripts\os-runner\windows\setup-runner.ps1"
```
The script:
1. Checks the tools and logins (it never prints a login).
2. Asks for two values from Vercel. Find them in project **lavaal** → Settings → Environment Variables: `KV_REST_API_URL`, and `KV_REST_API_TOKEN` (typed hidden).
3. Saves them in `%USERPROFILE%\.lavaall-runner.env`, which only you can read.
4. Proves the runner starts, while it stays **off**.

## Each time you want builds: start the runner
```
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\lavaall-runner\scripts\os-runner\windows\start-runner.ps1"
```
Leave that window open. It checks for builds every 20 seconds. Codex, Claude Sonnet and Claude Opus can each run one build at a time, side by side. The Build page shows "box seen just now" while it runs.

To stop:
- **Gently:** create the stop file with `New-Item "$env:USERPROFILE\.os-runner-stop"`. Any build in progress finishes first, then the runner stops.
- **At once:** close the window or press Ctrl+C. A build in progress is cut off and shows as failed.

## Good to know
- **Budget:** the $50 monthly budget still applies. Codex and Sonnet runs count $2 each, Opus $6. At the limit, the OS asks before going on.
- **What Claude can do during a build:** file tools only, inside the build folder; no shell, no web. Anything else becomes a card on the Build page for you to allow once or say no (`docs/os/BUILDER.md`, "Cards").
- **Runner says `claude_not_found` or `codex_not_found`:** that tool isn't on PATH in the window that started the runner. Open a new PowerShell window after installing it.
- **A tool installed somewhere unusual:** set `OS_RUNNER_CLAUDE_BIN` or `OS_RUNNER_CODEX_BIN` in the settings file to the full path of its `.exe` or `.js`.
- **Under the hood:** the Linux and macOS steps are in `docs/os/BOX-SETUP.md`. The runner itself is the same on every system (`scripts/os-runner/`).
