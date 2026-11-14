# Motion and interaction specification

| State | Trigger | Desktop | Mobile/reduced-motion |
|---|---|---|---|
| Closed | initial/close | Small dock icon; never block navigation | Small dock icon |
| Idle | no active task | Blink / slight bob / soft look around; no audio | Static blink or no motion |
| Walking | user has not interacted; timeout | Walk **within a bounded, non-interactive visual lane**, never over menus/forms | Disabled |
| Greeting | first intentional open | Short wave and a concise friendly greeting | Static wave or short fade |
| Listening | explicit mic opt-in (future phase) | Face/listening dots, freeze walking | Accessible label; no fake mic |
| Thinking | waiting for response | Gentle dots/pulse; announce status accessibly | Text status |
| Speaking | backend reply available | Mouth/eye animation synced to text chunks (not fake audio sync) | Light animation or static |
| Handoff | request successfully delivered | Wave + direct contact options | Same |
| Error | error | Stop motion, show recovery route | Same |
| Hidden | user hides | No mascot until toggled back | Same |

**Safety/UX constraints:**
- Do not literally traverse full screen or cross clickable controls. Walking follows a capped region near the hero, and stops on first user interaction, focus, scrolling, forms, reduced-motion or after a few seconds. Avoid constant movement.
- UI starts collapsed; avoid automatic intrusive modal, sounds, mic, or speech.
- Character should not speak unless voice feature separately authorized, paid limits in place and microphone/permissions handled honestly.
- Avoid animated text and tiny tap targets. Provide Hide/Close, stop animation and ordinary chat controls.
- Respect `prefers-reduced-motion`, `visibilitychange`, `pagehide` and limited bandwidth; stop animation in background tabs.
- On mobile, dock within safe-area insets, avoid bottom navigation, cookie banners, chat/input and viewport keyboard. No walking on mobile.
- Face expressions: idle smile, listening attentiveness, thinking dots, speaking short mouth cycles, error sympathy, success smile. Don't imply emotions or independent agency.
- Character must never claim to have sent a request, placed an order or checked live inventory unless server confirmed.
