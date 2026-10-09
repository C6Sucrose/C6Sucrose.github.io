---
title: Wayfinder
number: 2
summary: An assistant that acts within your limits and keeps a record you can verify.
category: agents
depth: full
visibility: private
repo: https://github.com/C6Sucrose/Wayfinder
branch: master
revision: 00e6d9957dd7bc26058cc4785b93f8086135831d
reviewed: '2026-10-05'
status: Local-first MCP server · source available on request
stack: [TypeScript, MCP SDK, Express, Zod, Vitest, Vite, Amazon Bedrock]
highlight: '16 tools'
highlightLabel: 'one bounded assistant'
review:
  - path: src/domain/authority.ts
    note: Decision precedence, low-confidence policy, currencies, and inclusive confirmation thresholds.
  - path: src/domain/ledger.ts
    note: Canonical representation and the SHA-256 hash chain.
  - path: src/domain/correlation.ts
    note: How reminders, duplicates, and corrections relate to existing documents.
  - path: src/mcp/server.ts
    note: The MCP tool/resource surface and how domain behavior is exposed.
  - path: test/authorityGate.test.ts
    note: Where to start reviewing governed-action tests after obtaining access.
runs:
  - label: 'Get the source · after access'
    requirements: GitHub repository access and Node.js 22+. Run from your projects folder.
    commands: |
      git clone https://github.com/C6Sucrose/Wayfinder.git
      cd Wayfinder
      npm ci
      npm run build
      npm start
    note: The server starts on http://127.0.0.1:8080. No cloud account is required for the rule brain. Photo reading requires the optional Bedrock setup.
  - label: 'Open the demo client · second terminal'
    requirements: A second terminal at the Wayfinder repository root; leave the server running.
    commands: |
      npm run dev:web
    note: Open http://127.0.0.1:5173. Say “Remember my keys are on the kitchen counter,” then “Where are my keys?” The offline client can also show the daily briefing and verify the ledger.
  - label: 'Review the checks · repository root'
    requirements: Installed dependencies. These commands check the original project after you have access.
    commands: |
      npm test
      npm run typecheck
      npm run adapters:conformance
    note: The inspected README reports 386 tests. That is a repository-reported snapshot, not a test run performed by this website.
evidence:
  - label: Model Context Protocol
    url: https://modelcontextprotocol.io/
    note: Background on the protocol the server implements. Wayfinder source and tests can be shared on request.
---
## Reading is only the beginning

Wayfinder explores a practical question for blind and low-vision users: after an assistant reads your paperwork, can it keep track of what matters, stay inside your boundaries, and explain what happened?

I built a voice-first MCP server that correlates documents into threads, tracks deadlines, supports a limited set of actions, and maintains a tamper-evident record. A bundled host displays accessible MCP App views alongside the conversation.

## Three things hold it together

**Calibrated abstention.** Uncertain readings have an explicit policy: ask, refuse, or escalate. A low-confidence amount does not quietly become an automatic action.

**An authority envelope.** Forbidden actions are refused first. Low-confidence policy follows. A currency mismatch or a value reaching the confirmation threshold requires confirmation. The browser illustration below exposes these choices on synthetic inputs.

**A verifiable record.** Each entry commits to its predecessor using SHA-256 over the previous hash and a canonical representation of the entry. Sensitive fields are redacted before hashing. Verification recomputes the chain and reports the first mismatch.

## The request path

Voice or text reaches the host, the brain chooses MCP tools, and the server invokes domain logic over a local store. The server can return an interactive app resource for the host to render. Optional notification, calendar, and payment-handoff adapters sit behind explicit interfaces.

The offline brain routes requests deterministically. Amazon Bedrock can add natural-language reasoning and an image reader. Without that reader, “read my mail” correctly explains that photo reading is not configured; it does not manufacture a result.

## What the record proves

The ledger is internally verifiable and tamper-evident. A recorded confirmation means the system recorded a confirmation; it is not independent legal evidence. Payment support prepares a SEPA QR handoff to the user's banking app and does not move money.

## Engineering decisions

I kept correlation, authority evaluation, IBAN validation, and hashing in pure domain logic, separate from the model and transport. Null adapters preserve local behavior until an integration is explicitly configured. Native controls, visible focus, live regions, and large-text support make the UI usable without relying on visual status alone.
