#!/usr/bin/env python3
"""Tiny Gemini patch helper. Stdlib only. Never prints API keys or key URLs."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_MODEL = "gemini-2.0-flash"
DIFF_CAP = 50000
TREE_CAP = 8000

SYSTEM = """You are editing a project repository.
Return a unified diff that `git apply` can use, inside a single ```diff fence.
Follow the rules and handoff in the user prompt.
Do not deploy, push to main, merge, send email, or change production settings.
Synthetic data only. Do not invent prices, contacts, or law.
Do not include secrets or .env files.
If no code change is needed, say so and return no diff.
"""


def redact(text: str) -> str:
    key = os.environ.get("GEMINI_API_KEY", "")
    if key and key in text:
        return text.replace(key, "[redacted]")
    return text


def run(repo: Path, args: list[str]) -> str:
    r = subprocess.run(args, cwd=repo, capture_output=True, text=True)
    return (r.stdout or "") + (("\n" + r.stderr) if r.returncode and r.stderr else "")


def repo_context(repo: Path) -> str:
    status = run(repo, ["git", "status", "--short"])
    log = run(repo, ["git", "log", "-8", "--oneline"])
    diff = run(repo, ["git", "diff", "HEAD"])
    if len(diff) > DIFF_CAP:
        diff = diff[:DIFF_CAP] + "\n... [diff truncated]\n"
    tree = run(repo, ["git", "ls-files"])
    if len(tree) > TREE_CAP:
        tree = tree[:TREE_CAP] + "\n... [file list truncated]\n"
    return (
        "## git status\n"
        f"{status or '(clean)'}\n"
        "## recent commits\n"
        f"{log}\n"
        "## uncommitted diff vs HEAD\n"
        f"{diff or '(none)'}\n"
        "## tracked paths (sample)\n"
        f"{tree}\n"
    )


def extract_diff(text: str) -> str | None:
    fenced = re.findall(r"```(?:diff|patch)\s*\n(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if fenced:
        return fenced[0].strip() + "\n"
    if text.lstrip().startswith("diff --git") or text.lstrip().startswith("--- "):
        return text.strip() + "\n"
    return None


def chat(model: str, key: str, user: str) -> str:
    url = f"{API_BASE}/{model}:generateContent"
    body = json.dumps(
        {
            "systemInstruction": {"parts": [{"text": SYSTEM}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"temperature": 0.2},
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        err = redact(e.read().decode("utf-8", "replace"))
        raise SystemExit(f"Gemini API error: HTTP {e.code}: {err[:500]}") from e
    try:
        parts = data["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts)
    except (KeyError, IndexError, TypeError) as e:
        raise SystemExit("Gemini API returned no message content") from e


def apply_diff(repo: Path, patch: str, out_path: Path) -> int:
    out_path.write_text(patch, encoding="utf-8")
    check = subprocess.run(
        ["git", "apply", "--check", str(out_path)],
        cwd=repo,
        capture_output=True,
        text=True,
    )
    if check.returncode != 0:
        sys.stderr.write(
            "Gemini returned a diff, but git apply --check failed. "
            f"Saved to {out_path}\n"
            f"{(check.stderr or check.stdout or '')[:800]}\n"
        )
        return 2
    applied = subprocess.run(
        ["git", "apply", str(out_path)],
        cwd=repo,
        capture_output=True,
        text=True,
    )
    if applied.returncode != 0:
        sys.stderr.write(
            f"git apply failed after a successful check. Saved to {out_path}\n"
            f"{(applied.stderr or applied.stdout or '')[:800]}\n"
        )
        return 2
    print(f"Applied patch and saved a copy at {out_path}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Tiny Gemini patch helper")
    p.add_argument("--repo", required=True)
    p.add_argument("--prompt-file", required=True)
    p.add_argument("--out-patch", default="")
    args = p.parse_args()
    repo = Path(args.repo).resolve()
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        sys.stderr.write("gemini: key missing\n")
        return 1
    model = os.environ.get("GEMINI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    task = Path(args.prompt_file).read_text(encoding="utf-8")
    user = task + "\n\n--- repository context ---\n" + repo_context(repo)
    print(f"Calling Gemini model {model} (no key printed)...")
    reply = chat(model, key, user)
    print(redact(reply))
    patch = extract_diff(reply)
    out_path = Path(args.out_patch) if args.out_patch else repo / "last-gemini.patch"
    if not patch:
        print("No unified diff in the reply; nothing applied.")
        return 0
    return apply_diff(repo, patch, out_path)


if __name__ == "__main__":
    sys.exit(main())
