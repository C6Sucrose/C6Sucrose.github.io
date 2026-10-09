---
title: app-factory
number: 3
summary: A repeatable path from product ideas to agent-assisted, quality-gated Android releases.
category: tooling
depth: full
visibility: private
repo: https://github.com/C6Sucrose/app-factory
branch: master
revision: 561582d86ae5d02aec88a8f61538d97551a18eee
reviewed: '2026-10-05'
status: Release core + Phase 3 agents · source available on request
stack: [Node 24, TypeScript, SQLite, Flutter, PowerShell, OpenCode, Google Play API]
highlight: '6 gates'
highlightLabel: 'a release has to pass'
review:
  - path: factory/orchestrator/src/orchestrator.ts
    note: Stage execution, bounded retries, state persistence, and checkpoint resume.
  - path: factory/orchestrator/src/machine.ts
    note: Legal state transitions; compare stored status with the last completed stage.
  - path: factory/orchestrator/src/stages/build_app.ts
    note: Builder loop and acceptance-test feedback in the agent-assisted path.
  - path: factory/orchestrator/src/scout.ts
    note: The newly added Idea Scout entry point.
  - path: factory/orchestrator/src/publisher.ts
    note: Mock publishing and the Google Play edit-transaction implementation.
runs:
  - label: 'Install · after repository access'
    requirements: GitHub repository access and Node.js 24+. Start in your projects folder.
    commands: |
      git clone https://github.com/C6Sucrose/app-factory.git
      cd app-factory/factory/orchestrator
      npm install
    note: This installs the orchestrator dependencies, including googleapis. The deterministic checks use fakes; no Google account is needed for that review route.
  - label: 'Run the deterministic checks'
    requirements: 'Working directory: app-factory/factory/orchestrator.'
    commands: |
      npm test
    note: The suite covers orchestration, agents, stages, and publisher contracts. Full Android builds additionally need the documented Windows/Flutter 3.24.5, JDK17, and Android SDK35 toolchain. Real agents need configured model credentials.
evidence:
  - label: Node.js native TypeScript support
    url: https://nodejs.org/api/typescript.html
    note: Runtime background; the private source uses Node24 TypeScript stripping and node:sqlite. Request access to inspect the implementation and tests.
---
## Shipping is a sequence of promises

A release has to do more than compile. Its toolchain needs to match, tests and analysis need to pass, permissions need to stay within the template's allowlist, secrets need to stay out, and the bundle needs to fit its size budget.

I built app-factory around an explicit, persistent state machine. A product brief enters a repeatable process, and each attempt leaves enough information to inspect the outcome or resume from a checkpoint.

## The release core

The original six-stage path is **configure → build → gates → listing → package → upload**. The quality gates cover toolchain pinning, static analysis, tests, permissions, secrets, and bundle size. A failed stage receives bounded retries; exhausting the budget quarantines the run.

The browser walkthrough below illustrates this six-stage release core. It uses synthetic state, not a running Flutter build. Stored statuses describe completed stages; resume proceeds to the next stage.

## What has grown since the first version

The current repository adds agent-assisted specification, acceptance-test generation, and a builder feedback loop before the release core continues. It also contains asset, critic, and screenshot stages, plus a recently merged **Idea Scout** command. Per-role model configuration separates responsibilities across the agents.

The Google Play publisher now implements a single edit transaction: insert an edit, upload the bundle, update the listing and track, then commit, with best-effort edit cleanup on failure. This supersedes the earlier skeleton described in my original portfolio. The default publisher is still a mock. The implementation has been inspected for this write-up; a real store publication has not been exercised as part of this site.

## Why the boundaries matter

Command execution, publishing, secrets, and state storage have explicit interfaces. That makes it possible to review the orchestration with fake runners rather than installing the entire mobile toolchain first. It also separates an unsuccessful model attempt from the deterministic release checks that must follow it.

## Where I would start a review

Read the transition model beside the orchestrator, then trace a failed gate through attempts and quarantine. Next, inspect how acceptance feedback reaches the builder and how the publisher cleans up a failed edit transaction. The quickstart below is deliberately the lightweight test route; the full agent/build setup is documented in the repository.
