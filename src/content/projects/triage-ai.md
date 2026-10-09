---
title: Triage-AI
number: 4
summary: Support-email triage with a scrub-before-inference LangGraph pipeline and tenant-scoped RAG.
category: agents
depth: compact
visibility: public
repo: https://github.com/C6Sucrose/Triage-AI
revision: 6569a14ecce7a423931a3105d5815d52973ac407
reviewed: '2026-10-05'
status: Multi-service application · external-service setup required
stack: [Python, FastAPI, LangGraph, Next.js, ChromaDB, Supabase, Docker]
highlight: 'PII first'
highlightLabel: 'scrub → classify → retrieve → draft'
review:
  - path: backend/agent/graph.py
    note: Follow the conditional spam branch and the retrieval/draft/ticket flow.
  - path: backend/utils/pii_scrubber.py
    note: Inspect exactly which identifiers the regex redaction handles.
  - path: backend/utils/rag_engine.py
    note: Check the tenant metadata filter and local embedding configuration.
runs:
  - label: 'Clone and prepare · PowerShell'
    requirements: Git, Docker Compose, and accounts/keys for Supabase, Clerk, and Groq. Trello is needed for ticket creation.
    commands: |
      git clone https://github.com/C6Sucrose/Triage-AI.git
      cd Triage-AI
      Copy-Item .env.example .env
      Copy-Item frontend/.env.local.example frontend/.env.local
      Copy-Item backend/.env.example backend/.env
    note: Fill all three environment files from your own service setup before building. Root .env supplies Compose build arguments; backend/frontend files supply runtime configuration. Follow the repository schema/auth setup.
  - label: 'Clone and prepare · macOS / Linux'
    requirements: Same service requirements; start in your projects folder.
    commands: |
      git clone https://github.com/C6Sucrose/Triage-AI.git
      cd Triage-AI
      cp .env.example .env
      cp frontend/.env.local.example frontend/.env.local
      cp backend/.env.example backend/.env
    note: Fill the environment files before building; no credentials are supplied by this website.
  - label: 'Launch · after configuration'
    requirements: Repository root, services configured, Docker running.
    commands: |
      docker compose up --build
    note: Dashboard at http://localhost:3000; API documentation at http://localhost:8080/docs. ChromaDB is internal to the Docker network.
evidence:
  - label: Architecture and setup
    url: https://github.com/C6Sucrose/Triage-AI/blob/6569a14ecce7a423931a3105d5815d52973ac407/README.md
    note: Includes the original demonstration and pipeline documentation.
---
I built an asynchronous B2B triage pipeline: accept an email, redact supported PII patterns, categorize it, retrieve tenant-specific context, draft a response, and create a Trello ticket. Spam takes a shorter path; peripheral ticket-service failures degrade gracefully.

The application combines a Next.js dashboard, FastAPI/LangGraph backend, ChromaDB, and Supabase. My CV reports roughly **68% less triage time against my own manual baseline**. The concrete review focus is the redaction and tenant-isolation code, rather than a blanket guarantee of zero leakage.

![Frames from the repository’s support-email triage demonstration](/images/triage.png)
