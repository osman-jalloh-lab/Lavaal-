# lavaall-ai

Harness switcher so Osman can keep working on the same project with Codex, Claude (Sonnet), DeepSeek, or Gemini. Every harness reads the same `RULES.md` and the project's `HANDOFF.md`, then appends a dated log line and mirrors it into Obsidian.

## Commands

```bash
# From this folder, or put it on your PATH:
./lavaall-ai status
./lavaall-ai projects
./lavaall-ai <harness> <project> "task"
./lavaall-ai <harness> <project> --dry-run "task"
```

Harnesses: `codex`, `claude`, `deepseek`, `gemini`.

`status` and `projects` are free. `status` never prints keys. It only checks CLI versions, whether keys are present, and (when a key is set) the provider `/models` list. Set `LAVAALL_AI_STATUS_SKIP_NETWORK=1` to skip those list calls.

`--dry-run` prints the composed prompt (rules + handoff + task) and does not call a model or append a log line.

## Seeded project

`salonehire` points at `/workspace/sw-interview-1121` on branch `feature/interview-tools`. Edit `projects.json` to add more. Each project needs `name`, `label`, `category`, `repo`, `branch`, and `handoff`. Obsidian copies go to `Projects/<Category>/<Project>/ai-handoff.md` under `obsidian_root` (override with `LAVAALL_OBSIDIAN_ROOT`).

## Backends

| Harness | What it runs | Notes |
|---|---|---|
| `codex` | `codex exec` in the repo | Codex CLI, ChatGPT login |
| `claude` | Claude Code CLI, `--model sonnet` | Never Opus |
| `deepseek` | `deepseek_helper.py` (stdlib) | `DEEPSEEK_API_KEY`. Default `deepseek-flash`. Override with `DEEPSEEK_MODEL`. |
| `gemini` | Gemini CLI if installed, otherwise `gemini_helper.py` | `GEMINI_API_KEY`. Default `gemini-2.0-flash`. Override with `GEMINI_MODEL`. Status says `key missing` when the key is unset. |

Do not put API keys in `projects.json`, `HANDOFF.md`, or this README.

## PATH

```bash
mkdir -p "$HOME/.local/bin"
ln -sf "$(pwd)/lavaall-ai" "$HOME/.local/bin/lavaall-ai"
```

The /os Harness page (founders only) copies these same commands. It does not call models.
