# Acceptance matrix — must be shown in draft PR

## Brand and design
- [ ] Technology and Web retain *same family* but robot vs cat-inspired variants are recognizably distinct.
- [ ] Colors and marks match CSS/SVG extracted from current repo with paths and screenshots. No unapproved yellow.
- [ ] Visual owner review of both characters before release.

## Usability and safety
- [ ] Mascot never blocks navigation, forms, consent checkbox, checkout or footer links; keyboard and touch work.
- [ ] `prefers-reduced-motion` has no walking; Hide/Close is keyboard-accessible.
- [ ] Mobile has dock icon only; complies with safe areas and software keyboard.
- [ ] Animations pause on hidden tabs and on input interaction; no surprise voice/mic.
- [ ] Screen reader labels and focus order work; WCAG contrast checked with current tokens.
- [ ] Works without JS via existing site; JS errors don't prevent core site interactions.

## Integration and regression
- [ ] Local visual prototype uses **zero network calls** and synthetic dialog.
- [ ] Tech route theme is not injectable by public input; Web uses correct knowledge adapter later.
- [ ] No new third-party domains or dependencies introduced without approval.
- [ ] Existing Technology inquiry and Web inquiry flows unchanged by mascot-only PR.
- [ ] No request submission without server-generated one-time confirmation + explicit separate Send.
- [ ] Never report success when the email path has not reported real delivery success.
- [ ] Backend rate limits persist across instances and Preview is isolated from Production.
- [ ] $25/month cap is fail-closed and verified with simulated cap breach; if impossible chatbot remains off.
- [ ] Verify current status of PR #74, #75, and #40; do not assume past draft reports are current.
- [ ] Screenshots/videos: desktop Technology, desktop Web, mobile, reduced motion, idle, walking, listening *mock state*, error.

## Deliverable evidence
Provide a test report with commands, pass/fail results, asset sizes, screenshots, accessibility findings, CSP and network inspection, and all unresolved blockers. Never claim a test passed without running it.
