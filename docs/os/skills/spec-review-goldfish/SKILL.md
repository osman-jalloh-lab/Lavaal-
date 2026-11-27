---
name: spec-review-goldfish
description: >-
  Use this alongside writing-plans or requesting-code-review whenever a spec or
  plan for a non-trivial build (new feature, /ops change, client build, new
  service) is ready for review, before any code is written. Skip it for small
  fixes.
---
# Spec review (fresh-eyes reviewers)

Adds four rules to writing-plans and requesting-code-review. The method is borrowed as text from google/elephant-goldfish-model (Apache-2.0). Nothing gets installed and it costs $0.

## When to skip
Small fixes skip this step entirely: a typo, a one-file bug fix, a copy or style tweak, or a change with no new behaviour or data flow. Use the normal review for those.

## Steps
1. **The writer drafts the spec.** The agent that has the full context writes the spec or plan and lists its sources (brief, tickets, files, links).
2. **Split it into sections.** Use the spec's own headings, such as goal, data, UI, security, rollout and tests.
3. **One reviewer per section, with no chat history.** Each reviewer is a separate fresh subagent that gets ONLY the draft spec and its listed sources. Never give it the conversation, earlier drafts or the writer's reasoning. Each reviewer covers exactly one section, and checks it against the rest of the draft only for contradictions.
4. **Reviewers report findings.** Each finding is labelled blocker, should-fix or nit, quotes the line it's about, and says what is missing or wrong. Reviewers don't rewrite the spec.
5. **The owner picks the fixes.** Collect the findings into one list and give it to the owner (the founder). The owner decides which findings get fixed. The writer makes only those fixes.
6. **The owner approves before any build.** No builder starts until the owner approves the final spec in their own words. Another agent passing the approval along doesn't count. Record the approval in the decision log.

## Output
- the spec, with a version and date
- the list of findings, grouped by section
- the fixes the owner picked, and the owner's approval line, with the date and time
