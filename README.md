# Huraira Ali / personal workstation

**[c6sucrose.github.io](https://c6sucrose.github.io)**

A personal website built around a Space Age workbench: AI and software projects, a professional/academic journey, and life beyond the keyboard. Original illustrated hardware, cassette graphics, a telescope, a plant, cooking notes, and a robotics sketch lead into six interest channels.

## Run locally

Requires **Node.js 24**. The site is Astro + TypeScript with fully static output.

```sh
npm ci
npm run dev
```

Open the local URL printed by Astro (normally `http://localhost:4321`). For the production build:

```sh
npm run check
npm test
npm run build
npm run check:links
npm run preview
```

`prebuild` creates the original 1200×630 social preview from `public/illustrations/social.svg` using Sharp. The output is entirely static and contains no private GitHub tokens or application credentials.

## Browser and accessibility checks

```sh
npx playwright install chromium
npm run test:e2e
```

On Windows the configuration uses installed Microsoft Edge (`msedge`); CI uses Chromium. The browser suite starts the built site's preview server, so run `npm run build` first. It covers real interactions, private-access routes, copy fallback, no-JavaScript content, responsive artwork geometry, screenshots, and axe accessibility checks. Screenshots/traces are written to the ignored `test-results/` folder.

To check the published site in PowerShell:

```powershell
$env:SITE_URL = 'https://c6sucrose.github.io'
npm run test:e2e
```

## Where to edit

| Material | Location |
| --- | --- |
| Personal background, experience, skills, credentials, testimonials | `src/data/profile.ts` |
| Six interests and console copy | `src/data/interests.ts` |
| Project summaries, setup instructions, evidence, case-study text | `src/content/projects/*.md` |
| Project content schema | `src/data/project-schema.ts` |
| Recorded ANON results | `src/data/anon-results.ts` |
| Original workstation drawings | `src/components/Artifact.astro` |
| Workbench layout and geometry | `src/components/workbench.css` |
| Centered personal badge | `src/components/Badge.astro` |
| Shared layout and colors | `src/layouts/SiteLayout.astro`, `src/styles/global.css` |
| Public CV and certificate bundle | `public/downloads/` |
| Project sample images | `public/images/` |

Project frontmatter records access status, the source revision reviewed, technologies, code-review entry points, and named command blocks with prerequisites. `depth: full` creates a case-study route; `depth: compact` creates an expandable homepage dossier. There are seven entries and three full case studies. The link checker verifies those launch invariants; update that check deliberately if the collection grows.

To add personal photographs, place optimized files in `public/images/` and include descriptive alternative text and an accurate caption. The present interest illustrations are conceptual, not photographs of the owner's equipment. New hobbies or achievements should be grounded in supplied material rather than invented gallery entries.

## Project preview boundaries

- **ANON4REID:** a four-method explorer of committed utility/privacy results. Utility ratios are converted to percent. The original sample and anonymized variants come from the supplied project portfolio. Baseline mAP is separately attributed to the report because its JSON was absent from the inspected tree.
- **Wayfinder:** a synthetic-input illustration of the authority envelope. The actual MCP server and image reader are not hosted here. Source remains private; access requests use email.
- **app-factory:** a deterministic illustration of the original six-stage release core, including failure/quarantine/reset. The current private repository also contains Phase 3 agent stages and a Google Play edit-transaction implementation. This website never builds or publishes mobile apps.

Site tests establish website behavior; they are not evidence that the original projects were rerun. Project write-ups label committed results, CV-reported metrics, external prerequisites, and private access. Review dates and revisions are stored with each entry and should be refreshed when project code changes.

## Design and readability

The approved direction combines NASA-retro / Space Age colors and cassette futurism with an original personal workstation. Ash Thorp's work informed mechanical detail and composition; no artwork from that site is bundled.

- Captions have their own layout areas beneath artwork.
- The telescope does not cover a heading or caption.
- Plant-pot lettering is centered and checked against its label rectangle.
- Badge stripes share a symmetrical centered group.
- Reduced motion is respected; no autoplay audio or flashing screen effect.
- All professional content has conventional links/navigation in addition to the illustrated route.
- Core content, project disclosures, and downloads remain available without JavaScript.

## Publish

The `site-build` branch is the publication branch. GitHub Pages must use **GitHub Actions** as its source. `.github/workflows/pages.yml` installs locked dependencies, checks types/content, runs model tests, builds, checks local links/assets, runs browser/accessibility tests, and deploys `dist/` on successful pushes. Pull requests validate without deploying.

Only the general CV and certificate bundle are downloadable. Academic transcript, enrollment confirmation, and compulsory-internship proof are available via contact links. The source CV folder and other repositories are outside this site repository.
