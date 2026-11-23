# OS project intake

`POST /api/os/ingest/project-intake` records a business-assistant intake after verifying a signed founder approval. It creates a planned goal and a proposed first task. It does not create a repository, grant access, call a model, run code, or send mail.

## Environment gate

The route returns `404 not_found` (before auth) unless `VERCEL_ENV` is `preview`, or `VERCEL_ENV` is `production` and `OS_INTAKE_PRODUCTION_ENABLED` is exactly `1`. Local/development runs are refused too.

## Authentication and request

Send `Authorization: Bearer <OS_INTAKE_TOKEN>` and a JSON body. The dedicated token must be at least 32 characters and must differ from `OPS_CEO_BRIDGE_SECRET` and `OPS_AUTH_SECRET`. It is accepted only for this intake route and does not establish a session. The request body is limited to 16,384 bytes. Include an `Idempotency-Key` header and/or `idempotency_key` in the body; if both are present they must match. Keys contain 16–128 ASCII letters, digits, `.`, `_`, `:`, or `-`.

The following is a synthetic example. Substitute an email from `INTAKE_APPROVERS` (currently only osmanjalloh104@gmail.com; sign-in allowlist unchanged) and a freshly calculated signature; the placeholders are not credentials.

```json
{
  "schema_version": 1,
  "idempotency_key": "example-intake-0001",
  "source": "business_assistant",
  "approval": {
    "approval_id": "example-approval-0001",
    "approver_email": "<intake approver email>",
    "approved_at": "2026-11-22T12:00:00Z",
    "action": "intake_create",
    "signature": "<64 lowercase hexadecimal characters>"
  },
  "project": {
    "name": "Example project",
    "description": "A synthetic project description.",
    "business_objective": "Improve an internal workflow.",
    "required_functionality": ["Track progress"],
    "acceptance_criteria": ["Progress can be reviewed"],
    "proposed_next_task": "Draft the project plan",
    "existing_repository": "example-org/example-repo",
    "existing_os_project": null,
    "requirements": [],
    "constraints": [],
    "priorities": []
  }
}
```

The top level accepts only the fields shown. `schema_version` must be `1` and `source` must be `business_assistant`. The approval ID uses the same character set as the idempotency key and is 8–128 characters. Its timestamp must be ISO-8601 with `Z` or an explicit offset, and no more than 15 minutes old or 60 seconds in the future. A bare `founder_approved` flag is rejected.

Project name is required and limited to 80 characters after trimming. Description, business objective, and proposed next task are required and limited to 1,200 characters each. Required functionality and acceptance criteria are nonempty arrays; the optional arrays each allow at most 20 nonempty strings of at most 500 characters. Existing repository is an optional `owner/repo` claim; existing OS project must name a catalog project. Sensitive project keys and email or phone-like content in accepted project strings are rejected. Unknown benign project fields are stripped and reported; unknown top-level fields are rejected. Avoid including personal or confidential information.

## Signature

Compute the signature after all fields are final, including any fields that will be stripped:

```text
unsigned = deep copy of body
remove unsigned.approval.signature
canonical = JSON with object keys sorted recursively, arrays in order, no whitespace
message = "lavaall-os-intake-v1\n" + canonical
signature = lowercase_hex(HMAC_SHA256(OS_INTAKE_TOKEN, UTF8(message)))
```

The signature binds the entire unsigned request. Changing any part after signing invalidates it. Keep the token out of logs, URLs, source files and documentation.

## Result and errors

A new intake returns `201` with `ok`, `project_id`, `project_status` (`catalog` or `pending_stub`), `goal_id`, `intake_id`, `approval_id`, a canonical OS `url`, `stripped_fields`, and a note describing the limited side effects. A matching completed idempotent replay returns `200` with the same response and `replayed: true`. A pending stub records an unverified repository claim; the goal's repository remains unset unless the project has an existing catalog mapping.

Responses are JSON and use `Cache-Control: no-store`:

| Status | Error codes |
| --- | --- |
| 404 | `not_found` (environment gate) |
| 400 | `invalid_json`, `idempotency_key_required`, `idempotency_key_mismatch`, `unverified_approval_field`, `unknown_field`, `approval_required`, `invalid_existing_os_project`, `forbidden_field`, `pii_detected`, `invalid_field` |
| 401 | `unauthorized` |
| 403 | `approver_not_allowed`, `approval_expired`, `approval_signature_invalid` |
| 405 | Method must be POST |
| 409 | `intake_in_progress`, `idempotency_conflict`, `approval_reused` |
| 413 | `payload_too_large` |
| 429 | `rate_limited` (more than 30 new intakes per UTC day) |
| 503 | `intake_store_not_configured`, `intake_store_unavailable` |

Some validation errors include field paths, but errors do not echo request values, credentials, or headers. Replays are checked after the signature but before the approval-window check and the daily rate limit, so an identical completed request can be retried later; a new write always needs a fresh approval. Approval IDs are single-use; use a new signed approval for a new intake.

## Trust model (read before enabling)

- The same `OS_INTAKE_TOKEN` authenticates the caller and keys the approval HMAC. The HMAC binds the approval (ID, approver, time) to the exact payload and makes it single-use, so a captured request cannot be replayed or edited. It does **not** prove, on its own, that the founder clicked approve: that check happens on the business-assistant side, which must only sign after an explicit founder approval in chat. Anyone holding the token can mint approvals, so the token is as sensitive as that approval step.
- Holding the token: store it only in the business assistant's secret vault / environment (never in chat, prompts, memory notes, repo files, or logs). The assistant builds the intake, shows Osman the exact fields, waits for his explicit approval, then signs and sends once with a fresh `approval_id` and `idempotency_key`. Retries reuse the same body and key.
- Scope: the token is checked only by this handler. It does not create a `lavaall_ops` session, cannot read goals, run chat, dispatch the coding runner, or touch other feeds. Existing ingest feeds still require `OPS_CEO_BRIDGE_SECRET` and reject this token.
- Preview first. Do not add a Production value until Preview has been tested and Osman says yes. Rotate by replacing the env value (both sides) — no code change needed.

## Known limits (next steps)

- The `/os` Harness UI does not yet read `?project=&goal=` from the link, and pending stub projects are not yet in the UI project picker or chat (`handleChat` still requires a catalog project). `GET /ops/harness/goals?project=<stub>` does list their goals.
- Promoting a stub into `tools/lavaall-ai/projects.json` is a reviewed catalog PR, not automatic.
