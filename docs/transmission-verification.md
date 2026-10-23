# Transmission verification

Updated **23 October 2026**, OpenCode AI agent. **WR-I1, WR-I2, WR-M1, WR-M2 and WR-M3 are locally verified; all 156 browser cases pass.** The unchanged runtime retains its attributed <2ms result and verified binding native §6 states. The stronger combined CLI first-fire observation remains **false/unverified**. Historical timing causes remain unknown.

## Checkout and environment

- Worktree: `E:/Code/CV/c6sucrose.github.io/.superpowers/worktrees/transmission`; branch `transmission-redesign`; HEAD `ed4edcd6664a2033feae26c8d215d3dd4a4c228d`.
- Windows; Node `v24.19.0`, npm `12.0.2`; current timing/trace used headless Edge `156.0.4314.42`. Historical visual evidence used Edge `155.0.4283.62`.
- Checkout-relative paths: `E` = `.superpowers/transmission-review`; `D` = `E/final2-attributed-timing`; `R` = `E/2026-10-22T17-15-16-153Z`; `N` = `E/2026-10-23T16-05-01-333Z`; `T` = `E/2026-10-23T16-29-09-141Z`; `S` = `.superpowers/sdd/2026-10-20-cv-site-transmission`; `F` = `S/final-fix-` (evidence prefix).
- Final fix wave: Layout/CSS, additive browser checks and this document. Protected controllers/models/data/assets/dependencies/configuration and original behavioral files retain their input hashes. Prior timing-only closure inputs remain recorded in `D`; fresh fix-wave inputs/results are under `F*`.

## Commands and actual outputs

The final fix wave ran the complete browser suite once after focused GREEN, on freshly built output. Exact commands, actual exits and per-command source/build hashes are in `F<label>-inputs.json`, `F<label>.log` and `F<label>-result.json`. Historical parent results (134/45/7/135 links) remain attributed to `S/progress.md:139`.

| Verification | Actual result / provenance |
| --- | --- |
| `npm run check`; `npm run build` | **40 files, zero errors/warnings/hints; five static pages** (`Fverified-check`, `Ffinal-build`). |
| `npm run test:e2e -- --output '.superpowers/sdd/2026-10-20-cv-site-transmission/final-fix-full-artifacts' --reporter=list,json` | **156/156** = 76 motion + 40 contrast + 16 final-fix + 15 site + 9 quality; zero skipped/flaky/unexpected, **167.558s**. Axe passes all five routes (`Ffull`, `Fevidence.json`). |
| `npm test`; `node --test test/review-runner.test.mjs` | **45/45 unchanged models; 7/7 unchanged reviewer tests** (`Fmodels`, `Freviewer`). Reviewer fixtures retain 44 native negative mutations plus null evidence. |
| `npm run check:links` | **165 local links/assets**, five pages/seven projects/three case studies, no broken links or duplicate IDs (`Flinks`). Increase of 30 is the intentional six-link fallback on each route. |
| `node .superpowers/transmission-review/run-task17.mjs final2-attributed-timing <command>` | **Exit 0, 45.400s**; exact command in `D/inputs.json`, output in `D/command.log`, result in `D/result.json`. One solo path and one separate trace. |

The historical timing-only command syntax-checks and runs `E/close-task17-timing.mjs D`. It extracts the exact existing `initializeReview`, `pointerPath`, `costSummary`, image and owned-preview methods from `scripts/review-transmission.mjs`; method hashes are recorded. Owned preview PID **2088** was ready in **1.004s**, stopped, and port 4321 cleared. The final fix wave adds scoped layout/print/label evidence; the timing/native recordings below remain retained evidence.

## Final whole-review fixes

- **WR-I1:** Native `details/summary` shares one reserved Menu cell with the original hidden button. `.js` enables the fallback at mobile widths; `:has(#primary-nav[data-open])` switches to the initialized control. Fallback navigation is default-closed and user-opened links overlay the content. All six labels/hrefs reuse the original binding; no additional IDs. Four 320/390px home/Wayfinder cases remove exactly one real **2417-byte inline site module**, leave transmission working, and verify native AX focus/expanded state plus actual section/contact/CV destinations. Discovery also handles external delivery without guessing filenames; current observed delivery is inline.
- **WR-I2:** Case metadata, compact expanded review headings (including nested run guides), and selected caption numbers render **#C9C3B2 on #0C1214**, Cascadia Mono/Consolas at 10–11px, **10.73:1**. All prior contrast assertions remain; six label-token cases are additive.
- **WR-M1:** Printed SpecPlate/heading chains keep with their first following block; prose h2/h3 are included. Long sections retain automatic pagination. Fresh A4 Wayfinder: **five pages, 11/11 actual heading/follower pairs on the same page**. Opened every rasterized page (`Fprint-green/page-{1,2,3,4,5}.png`); request-path heading/prose now page 3, review SpecPlate/title/note page 4.
- **WR-M2:** Reset-layer print override wins the important reservation. Genuine delayed/pre-init hidden filters have **height 0 and both margins 0** in print, as do initialized filters. Screen reservation remains **96/44px** at 390/1440px with **22px margins**.
- **WR-M3:** At <=360px the number sits above the full label width. Exact captions and accessible names, **10px** glyphs, intact words, independent cells, clicks, focus and no overflow pass. Opened fresh 320/390 PC and complete artwork crops (`Ffinal-green-artifacts/.../pc-caption-{320,390}.png`, `artwork-caption-{320,390}.png`).
- **Geometry/CLS:** `Fevidence.json` contains **20** same-run home/Wayfinder × normal/delayed × five-width observations, all supported **CLS 0**. Mobile delayed cases open native navigation and wait 650ms before release, outside recent-input exclusion. Header heights at 320/390/768/1024/1440 are **157/157/93/103/103px**; the native and ready Menu footprint is **74.21875×44px**. `Ffive-width-geometry.json` retains all six caption boxes/word line counts/hit targets at every width.
- **Fresh presentation evidence:** `Fheader-{320,390,768,1024,1440}.png` captures normal headers after boot actually completes, while observing initial-load CLS. Native-fallback and delayed-open images are in `Ffull-artifacts`. Large expanded-label captures include an offscreen fixed skip-link artifact; `Flabels.json` records it unfocused at top -100px/bottom -47.75px, alongside viewport-contained h4 crops in `Freview-label-{1,2,3,4}-390.png`. Original captures remain preserved.
- **RED provenance:** Actual navigation absence, red mono tokens, hidden print gaps, detached A4 headings and the split `troubleshooting` word were observed before final fixes. Failed test-harness attempts (Window typing, synthetic summary role, AX uppercase/trailing whitespace and Edge's browser-owned PDF request stream) remain raw, not counted as passes. Corrected native RED was replayed with only the new fallback temporarily removed; `Ffocused-green` subsequently passes all nine navigation/CLS cases.

## Geometry assertions: before and after

- Retained 25 route/width captures and five expanded NASA Kepler briefs are prior observations. Fresh affected header/caption/label/print geometry is recorded above; drawing and artifact-motion source hashes remain unchanged.
- The approved plant-only to all-SVG text-bounds and fixed (65,65) badge to normalized viewBox-center substitutions remain in the unchanged site/quality files. Caption-top >= graphic-bottom, clicks, navigation, clipboard, filters, deep links, authority and pipeline assertions remain intact and pass.
- Saved frame audits report zero admitted-frame DOM/media/layout reads or forbidden mutations, one maximum queued callback and one passive bay listener; writes are only `--prox`, `--nx`, `--ny`.
- The retained 320px channel/HOME test observes the PC center move **−20.5px** without resize/scroll; ingress refreshes cached centers outside the frame loop.

## Route-by-width visual review

- The 22 October reviewer opened all **25 actual images**, five expanded briefs and artwork crops for `/`, ANON4REID, Wayfinder, app-factory and the actual 404 at **320/390/768/1024/1440px**.
- Retained observations: distinct bounded specimens, centered pot label, separate captions, readable opaque bone prose, crisp file edges, decorative-only cyan/peach, and a distinguishable actual **32px favicon**.
- Files: `R/{home,anon4reid,wayfinder,app-factory,404}-{width}-reduced.png`, `R/expanded-brief-{width}.png`, `R/finale-review/artwork-{width}.png`, `R/finale-review/favicon-32.png`. These are prior visual observations, not new captures.

## Six-specimen motion review

| Specimen | Nominal beat | Recorded selected segment | Retained sampled observation |
| --- | --- | --- | --- |
| PC | 4.2s | 5.739s | Iris/fan/heat move internally; plate/caption fixed. |
| Games | 5.6s | 7.122s | Scan/cursor/stick restrained within the handheld. |
| Nature | 7.1s | 8.626s | Asymmetric leaves/drop; pot lettering stays readable. |
| Cooking | 8.3s | 9.833s | Steam/broth/lamp around a fixed vessel. |
| Sky | 9.7s | 11.223s | Aperture/stars/satellite preserve the rim and caption. |
| AI | 11.3s | 12.829s | Arm/focus/scan preserve the base composition. |

- All six recorded reaction **1.6**, then `{selected:false, react:1}`; exact beat−1/beat expiry and finer pointer caps are separate maintained-test evidence. Telemetry identifies **29 unique nodes** and canonical paused carriers after suppression.
- Ambient/selection WebM: `R/page@5540beba9c103e40467c393ca050e64e.webm`, **108.04s**, including **50.008s ambient**, 110 frames/all 10 sheets inspected. Boot: `R/page@35566c58b5bf39d96a36d238dceea64d.webm`, **5.48s**, 24 frames/both sheets inspected; **1202.8ms** lifetime, no remaining nodes/errors, CLS 0.
- Both recordings were completely decoded, with **1Hz ambient / 4Hz boot** inspection. Labels are output CFR-grid positions, not original frame timestamps; no uninterrupted human playback is claimed. Fast rotations/blinks and 60ms LEDs rely on separate timing tests.

## Contrast, focus, pulse-rate, and tear-area measurements

- Retained contrast ratios: bone/hull **14.86:1**, bone-dim/hull **10.73:1**, bone-dim/raised **9.82:1**, ink/bone **13.92:1**, ink-dim/bone **6.25:1**, core/hull **5.12:1**, core-plate/bone **5.44:1**, trim/hull **12.50:1**. Focus/print/axe and boot keyboard checks passed in the attributed suites.
- Pulse contract: **29 nodes / 17 opacity tracks**, maximum reaction 1.6, minimum rise gap **840ms**, maximum per-track rise **1.190476Hz**. This is a keyframe measurement, not an exhaustive combined-flash assessment.
- Tear band: **11136 / 1512000px² = 0.7365%**, one non-intercepting 0.2s band. Retained native recording has nine starts, **200.2–206.4ms** durations, ambient gaps **26.7889 / 27.2198s**; tests independently cover 20–34s endpoints and suppression.

## Pointer callback, CLS, source and emitted-module budgets

| Current metric | Actual value |
| --- | --- |
| Solo raw callbacks | **5134 complete samples**, 1000 fixed native-browser mouse moves, **31.678s** capture. |
| Strict maximum | **0.20000000298023224ms < 2ms**; **zero ≥2ms**, no samples removed. |
| p95, informational only | **0.10000000894069672ms**; maximum remains the acceptance criterion. |
| Same-run callback identity / CLS | **`[1]` / 0**; all raw identity entries pair with costs; CLS observer supported, errors `[]`. |
| Authored / complete shipped / gzip | **9410 / 3999 / 2024 bytes**; one identical inline module on all five routes, no imports/coalescing; strict 4000 headroom **1 byte**. |

`D/solo.json` retains original-order costs, per-sample callback IDs, same-context CLS/state, served boot-key attribution and capture boundaries. No identity/CLS was borrowed from the controller or native runs. `D/measurement-{start,end}.json` and `D/measurements.json` preserve matching current inputs and complete five-route delivery attribution.

Fresh `Fpayload.json` reattributes all five final built documents: **9410 authored / 3999 shipped / 2024 gzip bytes**, identical hashes below, one-byte headroom, no imports/coalescing/test gates. Executable-script census: bootstrap **255**, workbench **1432** (home), site **2417**, previews **4536** (cases), alive **3999** bytes. No new JavaScript delivery; the additional fallback payload is conventional HTML. Timing/trace/native histories remain their original runs, rather than being relabeled as fresh experiments.

- Source SHA-256: `63c9fea65e5c0c357d42eb51bdd2994a3d0ca97c7ca2171fe690d932fb40baf0`.
- Delivered SHA-256: `e88154adc2638bcbf718317fcfc7a13273ba1c53ec4974f63ac121b3ecd54c82`.
- Maintained reviewer SHA-256: `20938d2867a3abd89cfbf4c4fc05ef17d08b105821f0ee0fc182fb9f8ee38797`.
- Separate diagnostic context: `D/pointer-performance.trace.json`, **17015700 bytes / 87717 events**; `D/pointer-cpu-profile.json`, **3377 CPU samples**. Sampled script **8** resolves to the same 3999-byte boot-key module/hash.
- Individual inclusive trace maxima: FunctionCall **0.104ms**, FireAnimationFrame **0.116ms**, style/UpdateLayoutTree **2.032ms**, Layout **0.087ms**, PrePaint **0.230ms**, Paint **0.206ms**, **MajorGC 23.991ms (three events)**. All events, including long style/GC events, remain raw; `D/trace-summary.json` records durations and thread provenance. **Do not sum overlapping durations or substitute them for solo callback costs.**
- **Controller ruling (`S/progress.md:137`):** accept attributed current-runtime maximum/identity/CLS plus a separate diagnostic trace. **Historical 2.1ms / 5.2ms causes remain unknown**, not retrospectively proved by today's GC/style observations. Failures remain failures in `R/measurements.json` and `S/task-12-results{,-final}.json`; the old 3712-sample/0.8ms controller run lacks same-run identity/CLS and is supplemental only. **37 referenced history files** are hash-preserved.

## Storage, no-JS, runtime-load, visibility and touch fallbacks

- Attributed suites cover throwing storage, session-once boot/watchdog, repeated frozen entries, actual inline-runtime suppression, no-JS content/navigation and original controllers; coarse/touch and observer/media cases are emulated browser evidence.
- **Binding native §6 PASS**, already reviewed in `S/task-17-fix2-review.md`: `N` uses trusted raw headed CDP/default context with `noDefaults:true`, owned Windows minimize/restore and confirmed foreground HWND **1247362**. Trusted hidden at **12217.5ms** cancels pending ID **147** at **12217.7ms**; hidden queue/listeners/timers/vectors/effects are zero.
- Frames stay **144 / 144 / 144** through hidden/late-hidden/pre-input return. One fresh trusted input at **32518.3ms** resumes a unique callback/native-ID stream, maximum queue **1**, then finite idle settlement. No pre-input replay.
- Return clears old timer **1** and owns fresh timer **2**, **20s**, due **52007.4ms**; the **19.5021s** visible quiet gap has zero starts. New trusted hidden at **51548.5ms (458.9ms before due)** clears it before firing. This is fresh ownership/second-suppression evidence, not an eligible missed fire.
- **Stronger combined CLI limit:** actual first fresh ambient fire remains absent, **`observed:false` / exit 1**. `visibilityIssues()` stays strict. Binding states pass under `S/progress.md:138`; the combined empirical limit remains visible and is not an established application defect. Re-hide cause is unknown.
- **Topmost experiment (`T`) remains unverified:** the sole 180s timeout occurred before window/foreground/control setup; window `{}`, telemetry null, native exit unknown. External owned-PID/port cleanup does not prove topmost setup or normal restoration. Raw partial/failed native histories remain intact.

## Outstanding issues and decisions

- **I1 current evidence gate met** under the final controller ruling; historical causal uncertainty and possible environment-dependent recurrence remain explicit. I2/M1/M2 and N1 retain their preceding reviewed dispositions.
- **Binding visibility states met; combined CLI first-fire/topmost execution unverified.** No new native observation or weakened validator is claimed.
- Firefox/WebKit, physical touch hardware and uninterrupted human motion playback remain evidence limits. Authored source is **9410 bytes**, separately disclosed under the complete-shipped-runtime ruling.
- All five assigned whole-review findings **WR-I1, WR-I2, WR-M1, WR-M2, WR-M3** are closed by the final scoped fix wave. `S/final-fix-report.md` records commands, proof paths, source hashes, preservation audit and remaining limits; the controller owns the subsequent scoped independent re-review.

## Publication evidence

- Evidence concerns this local built worktree. **No staging, commit, push, ledger/original-checkout write or deployment occurred in this closure; no claim about published content is made.**
- Ordered self-reviews: `D/scoped-review.md`, then `D/whole-change-review.md`; final integrity/document record: `D/closure-audit.json`. Handoff: `S/task-17-report.md`; exact pre-closure documents: `D/{transmission-verification,task-17-report}-before.md`.
- Historical manifests, failed/partial native attempts, raw outliers, videos and prior reviews remain preserved. Fresh final-wave results are 156 browsers / 45 models / 7 reviewer cases / 40-file check / five-page build / 165 links; no new long motion recording or native §6 experiment is attributed to this wave.
