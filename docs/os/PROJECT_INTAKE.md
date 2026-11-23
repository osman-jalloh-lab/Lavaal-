# OS project intake

`POST /api/os/ingest/project-intake` records a business-assistant project intake after it has been approved in Osman's own signed-in OS session. It creates a planned goal and a proposed first task. It does not create a repository, grant access, call a model, run code, or send mail.

## Environment gate

The route returns `404 not_found` (before auth) unless `VERCEL_ENV` is `preview`, or `VERCEL_ENV` is `production` and `OS_INTAKE_PRODUCTION_ENABLED` is exactly `1`. Local/development runs are refused too.

## KV key prefix (S4)

All goal, intake and approval keys come from one helper, `rootFor(env)` in `api/ops/_harness_goals.js`:

| `VERCEL_ENV` | Root | Example |
| --- | --- | --- |
| `production` | `lavaall:goals:v1:` (unchanged from #103) | `lavaall:goals:v1:item:goal-<uuid>` |
| anything else (preview, development, local, tests) | `lavaall:preview:goals:v1:` | `lavaall:preview:goals:v1:item:goal-<uuid>` |

Kinds under the root: `item`, `events`, `project`, `catalog`, `tasks`, `approvals`, `approvals-used`, `intake`, `intake-idem`, `intake-rate`. Preview and Production currently share one KV store, so this prefix keeps test data out of the live OS; production code never reads the preview root, and a preview approval cannot be used in production.

## Flow

1. The business assistant prepares the intake body (below, without `approval_id`) and shows it to Osman.
2. **Osman approves in his own signed-in `/os` session** (S2). `POST /ops/harness/approvals` with `{ "action": "intake_create", "payload": <intake body without approval_id> }`. This route sits behind the existing founder session gate, requires a same-origin `Origin`, and only accepts sessions whose email is in `APPROVERS` (`api/ops/_approvals.js`; currently only osmanjalloh104@gmail.com; the sign-in allowlist is unchanged). The server validates the payload, computes its request hash and returns `{ approval_id, request_hash, expires_at }` (15 minutes). A UI button for this is a next step.
3. The business assistant sends the same body plus `approval_id` to the intake endpoint with `Authorization: Bearer <OS_INTAKE_TOKEN>`.
4. The intake checks that the approval exists, was minted by a founder session for an approver, has action `intake_create`, matches the request hash, and has not expired, then consumes it once.

The token authenticates the sender only. It cannot mint approvals, does not establish a session, and is accepted by no other route; the other ingest feeds still require `OPS_CEO_BRIDGE_SECRET`.

## Request

Body limit 16,384 bytes. Synthetic example:

```json
{
  "schema_version": 2,
  "idempotency_key": "example-intake-0001",
  "source": "business_assistant",
  "approval_id": "appr-00000000-0000-4000-8000-000000000000",
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

- Only the fields shown are accepted. Any other field, at the top level or inside `project`, is rejected with `400 unknown_field`, and its name is not echoed (S5). A bare `founder_approved` flag gets `400 unverified_approval_field`.
- `idempotency_key` (16-128 of `A-Z a-z 0-9 . _ : -`) is required in the body; an `Idempotency-Key` header, if sent, must match.
- Name max 80 characters; description, business objective and proposed next task required, max 1,200 each. Required functionality and acceptance criteria are non-empty arrays; all arrays max 20 non-empty strings of max 500 characters. Text containing email addresses or phone-like numbers is rejected. Free text can still carry names, so keep intakes to engineering requirements.
- `existing_repository` is an unverified `owner/repo` claim. `existing_os_project` must name a catalog project in `tools/lavaall-ai/projects.json`.

### Request hash

```text
unsigned  = body without approval_id
canonical = JSON with object keys sorted recursively, arrays in order, no whitespace
hash      = lowercase_hex(SHA256("lavaall-os-intake-v2\n" + canonical))
```

The approval is bound to this hash, so any change to the body after approval fails with `403 approval_mismatch`.

## Project attachment (S3)

The goal attaches to a catalog project only when `existing_os_project` is given. Otherwise a pending stub `catalog:stub-<slug>` is created (or reused) with the claimed repository stored unverified; stub ids never collide with catalog names, and the goal's `repository` stays null.

## Untrusted text in chat (S6)

Goals created by intake carry `source: business_intake`. When such a goal is selected in harness chat, its objective is inserted inside an `UNTRUSTED_INTAKE_TEXT` block labelled as requirement data, not instructions.

## Result and errors

A new intake returns `201` with `ok`, `project_id`, `project_status` (`catalog` or `pending_stub`), `goal_id`, `intake_id`, `approval_id`, a canonical OS `url` (`https://www.lavaall.com/os/?project=…&goal=…#harness`) and a note. A completed identical replay returns `200` with the same response and `replayed: true`, even after the approval has expired.

| Status | Error codes |
| --- | --- |
| 404 | `not_found` (environment gate) |
| 400 | `invalid_json`, `idempotency_key_required`, `idempotency_key_mismatch`, `unverified_approval_field`, `unknown_field`, `approval_required`, `invalid_existing_os_project`, `pii_detected`, `invalid_field` |
| 401 | `unauthorized` |
| 403 | `approval_not_found`, `approval_mismatch`, `approval_expired` |
| 405 | Method must be POST |
| 409 | `intake_in_progress`, `idempotency_conflict`, `approval_reused` |
| 413 | `payload_too_large` |
| 429 | `rate_limited` (more than 30 new intakes per UTC day) |
| 503 | `intake_store_not_configured`, `intake_store_unavailable` |

Mint route (`POST /ops/harness/approvals`): `401/403` without a founder session, `403 invalid_origin`, `403 approver_not_allowed`, `400 invalid_approval_request` or intake validation errors, `503 approval_store_unavailable`.

Errors include allowlisted field paths at most; they never echo request values, unknown field names, credentials or headers.

## Token handling

Keep `OS_INTAKE_TOKEN` only in Vercel (Preview, branch-scoped) and the business assistant's secret store; never in chat, prompts, memory notes, repo files or logs. Pass it to tools from a file, never as a command-line argument. Rotate it after testing. No Production value until Osman approves.

## Known limits (next steps)

- No `/os` UI button yet for minting an approval; the endpoint exists.
- The `/os` Harness UI does not read `?project=&goal=` yet, and stub projects are not yet in the UI picker or chat (`handleChat` requires a catalog project). `GET /ops/harness/goals?project=stub-…` lists their goals.
- Promoting a stub into `tools/lavaall-ai/projects.json` is a reviewed catalog PR.
- N2: partial-failure cleanup after the goal is written.
