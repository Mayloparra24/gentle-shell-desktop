# Web host for Gentle Desktop: proposal package

Feature document (ODD). Repository: Mayloparra24/gentle-shell-desktop (fork of Gentleman-Programming/gentle-shell-desktop). Base: `main` at `5ab4a00`. Branch: `docs/web-host-proposal`. Scope: documentation only; no source file changes.

## Specs

- S1 A proposal document that explains the web host idea: "tener documentación".
- S2 Diagrams of it: "diagramas".
- S3 A presentation in the style of the Gentleman ecosystem: "si se puede presentación estilo al ecosistema gentleman".
- S4 The idea itself, as the user described it: "ejecutar por ejemplo gentle-shell-web y que me abra una web con un diseño como escritorio no de terminal pero con todo lo de shell".
- S5 Out of scope for this proposal, recorded as future work: "separación de sesiones", "talvez no mostrar sesiones que ya se hizo control + d y se cerró", "poder hacer /gentle:*".
- S6 Evidence reported by the user, not reproduced by the author of this document: "si pude hablar en el host web, le pregunté que si podia usar engram y me dijo que sí".

## Tasks

- [x] P1 Branch and this feature document. S1-S6. Route: inline. Commit: the one titled `docs(web-host): propose a second host`.
- [x] P2 `docs/web-host/README.md`, the proposal. S1, S4, S5, S6. Route: inline. Commit: `docs(web-host): propose a second host`. Checked: relative links resolve; every figure in it was measured or taken from the spike report (811, 380, 13, 19, 350 of 351, 2,267, 2,189, `dc39e48`).
- [x] P3 `docs/web-host/diagrams.md`, Mermaid diagrams. S2. Route: inline. Commit: `docs(web-host): propose a second host`. Checked: 7 of 7 blocks parse and render with Mermaid 11.17.2 in real Edge. Not checked: how they look on GitHub.
- [x] P4 `docs/web-host/deck.html`, a self-contained slide deck in the Gentleman-Cute look. S3. Route: delegated writer, reads P2 as its specification. Commit: `docs(web-host): add the presentation deck`. Checked by the worker and again by the parent in real Edge: 15 slides, no overflow at 1280x720 and 390x844, no console errors, no request other than the file itself. Known limits: on a phone the wide diagrams scroll sideways with no visible hint; the title slide leaves its lower half empty; no Firefox, Safari or real print dialog.
- [x] P4b `docs/web-host/deck.es.html`, a Spanish version of the deck (the user asked for it in L5). Route: delegated writer, then parent review. Commit: `docs(web-host): add a Spanish version of the deck`. Checked by the parent in real Edge: 15 slides, no console errors, no request other than the file, no voseo, same numbers with the same frequency as the English deck. The worker's checks and the parent's first pass both passed a defect that screenshots showed: on a 390 px screen the evidence table lost its last row (the one marked "No reproducido") and the limits slide ran under the footer, because `fit()` only measured the slide itself. Fixed in the Spanish deck by also checking clipping containers and the footer; re-verified by screenshot. The English deck is not affected at 390 px but fails the same stricter check at 360x640 (slides 3, 6, 8, 12); not fixed. Not reviewed by a native speaker.
- [ ] P5 Push to the fork. S3. Route: inline. The issue draft is written outside the repository and published only on the user's decision.

## Constraints

- Artifacts in English, neutral register (repo convention, `odd/tasks/desktop-m1-chat-core.md:28`).
- Every factual claim has a source: a file and line, a command output, or "reported by the user".
- Say what the spike does not prove, in the same place as what it proves.
- Do not claim maintainer intent. The proposal asks; it does not decide.
- No external resources in the deck: local font stacks only, like the gentle-shell install wizard.

## Log

- L1 (user, 2026-10-23): "ya lo probé, si pude hablar en el host web, le pregunté que si podia usar engram y me dijo que sí, obvio hay que agregar más cosas como separación de sesiones, talvez no mostrar sesiones que ya se hizo control + d y se cerró, poder hacer /gentle:* y etc pero eso es a futuro, la idea es tener documentación, diagramas y si se puede presentación estilo al ecosistema gentleman"
- L2 (user, earlier in the same conversation): "tenia en mente algo como herdr web, digamos ejecutar un comando en la terminal y que abra una web en localhost para usar gentle-shell-web tipo aplicación desktop"
- L3 (user, earlier): "quiero que contemples el hacer incluso otro repo con un nombre, entonces para ver si me entendiste, sería ejecutar por ejemplo gentle-shell-web y que me abra una web con un diseño como escritorio no de terminal pero con todo lo de shell"
- L5 (user, 2026-10-23): "puedes hacer la presentación en español tambien?"
- L4 (user, earlier): "la idea es hacer un plan y mostrar la IDEA para ver que dicen los manteiners y ver si en los documentos en los issue y pr no hablan de eso"
