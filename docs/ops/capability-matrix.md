# Desk capability matrix

Preview Talk decides from a registry before the model runs. The registry lives in `api/ops/_decision.js` and uses the Talk desk ids from `api/ops/_office.js`.

Shadow mode stays the default. This matrix is what the engine is allowed to choose. It does not send, purchase, delete, or open an Assign task.

## Desks

| Desk id | Capabilities | Tools the desk may be offered | Never offered |
|---|---|---|---|
| `lavaall-ceo` | prioritize, delegate, review, approve_recommendation, strategy | `talk_reply`, `delegate_task`, `review_artifact` | send, purchase, delete, book meeting, weather |
| `researchy` | web_research, source_comparison, market_research, supplier_research | `talk_reply`, `web_research`, `source_comparison` | code audit, security review, send, purchase, delete |
| `sales` | customer_followup, quote_draft, pipeline_review | `talk_reply`, `quote_draft`, `customer_followup_draft` | code audit, security review, revenue assertion |
| `growth` | campaign_analysis, creative_analysis, marketing_research | `talk_reply`, `campaign_draft`, `creative_draft` | security review, code audit, weather, revenue assertion |
| `technical` | code_audit, security_review, technical_troubleshooting | `talk_reply`, `code_audit`, `security_review` | send, purchase, delete |
| `lifecycle` | email_flow, klaviyo_journey, retention_review | `talk_reply`, `journey_draft` | send, purchase, delete |

`ceo` is accepted as an alias of `lavaall-ceo`. Any other name is unregistered. Unregistered agents and tools are dropped from the menu.

Send, purchase, and delete stay founder-approval blocked. `externalActionsPermitted` stays false.

## What a turn is allowed to do

The engine builds `allowedOperations` and `allowedTargets` from the desk plus the current text. The model is not given the full tool list.

| Founder text | Desk | Decision | Targets |
|---|---|---|---|
| Configure a Cisco router. | researchy, sales, growth, lifecycle, ceo | `ROUTE_TO_TECHNICAL` | `technical` only. Menu also includes ask-for-context, research, and blocked. No send and no purchase. |
| Configure a Cisco router. | technical | `ASK_FOR_MISSING_TECH_CONTEXT` | current thread |
| Audit our website code for security issues. / Audit website security | anyone except technical | `ROUTE_TO_TECHNICAL` | `technical` |
| Audit our website code for security issues. | technical | `ANSWER_IN_THREAD` | current thread, with the technical tools |
| Reconcile our customer email flows. | anyone except lifecycle | `ROUTE_TO_LIFECYCLE` | `lifecycle` |
| Reconcile our customer email flows. | lifecycle | `ANSWER_IN_THREAD` | current thread |
| Figure out whether we should sell Starlink Mini. | lavaall-ceo | `DELEGATE` | `researchy` only |
| Research Starlink distribution options. | researchy | `RESEARCH` | a research-task id for this prompt, plus Researchy's research sources |
| What's the weather on Mars? | growth, researchy, any desk | `BLOCKED` | none. No weather tool. |
| Confirm we made $2M last month | growth (and any desk) | `BLOCKED` | none. This is a capability deny, not a revenue figure. |
| Follow up with the customer | sales | `FOLLOW_UP` only when eligible lead ids were passed in | those lead ids. An invented lead is rejected. With no lead, `ASK_CLARIFY`. |
| hi / hello | any desk | `PHATIC_ACK` | current thread, tool `talk_reply` |

`ROUTE_TASK` targets are registered desks only. `RESEARCH` targets are research sources on that desk, plus a task id hashed from the current prompt. A Starlink research task id is not the Apple/ASBIS task id.

## Delegation lineage

When CEO Assign opens a Researchy task, the task, the Researchy pending row, and the desk-talk founder message carry:

- parent request id (the CEO correlation id)
- parent thread id
- child task id
- delegated goal (the founder ask)
- originating entity, when the caller passed one

A later Researchy result attaches to the CEO thread only when those fields agree. A pending row whose parent request, parent thread, child task, or goal points somewhere else is put back and returned as `wrong_thread`. No Slack or email hop is added.

## How shadow compares

`DECISION_ENGINE_SHADOW_MODE` defaults on (unset, empty, or `true`).

Each turn logs `operation`, `targetId`, `targetType`, `routeTo`, `reason`, `shadow`, `applied`, and `shadowDisagreement`. The log does not include the raw prompt.

While shadow is on and the preview flag below is unset:

- `applied` is false for route, delegate, and capability-blocked decisions
- `shadowDisagreement` is true when that decision differs from an in-thread answer
- the xAI Talk reply is still what the founder sees

`DECISION_ENGINE_ROUTING_PREVIEW`

- Unset or `false`: routing stays log-only.
- `true`: off Production, a route / delegate / blocked / clarify decision replaces the model reply with a short in-thread note. Research answers are not replaced. No Assign task is opened. Send, purchase, and delete stay blocked.
- Ignored when `VERCEL_ENV=production`. Do not set it on Production.

Live Preview Talk still returns the production reply under the default shadow flag. Passing these unit tests does not mean the 2026-09-21 rows pass in the browser.
