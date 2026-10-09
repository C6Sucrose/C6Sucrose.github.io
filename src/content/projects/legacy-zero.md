---
title: Legacy-Zero
number: 7
summary: Java-to-Python migration through atomic decomposition, agent voting, and generated checks.
category: agents
depth: compact
visibility: public
repo: https://github.com/C6Sucrose/Legacy-Zero--Autonomous-Migration-Foundry
revision: 68a7b6a233ffd58ebd3067215b1aef9f83422e51
reviewed: '2026-10-05'
status: Agentic migration experiment · model API for real translations
stack: [Python, LangChain, Tree-sitter, Streamlit, OpenAI-compatible API]
highlight: 'Decompose'
highlightLabel: 'vote → verify → assemble'
review:
  - path: src/core/decomposer.py
    note: Tree-sitter extracts Java methods and structural context.
  - path: src/core/consensus.py
    note: First-to-ahead-by-k voting; inspect stopping and failure behavior.
  - path: src/core/verification.py
    note: Generated tests and subprocess execution; inspect what verification actually guarantees.
runs:
  - label: 'Prepare · any terminal'
    requirements: Git, Python3.11+, and uv. Start in your projects folder.
    commands: |
      git clone https://github.com/C6Sucrose/Legacy-Zero--Autonomous-Migration-Foundry.git
      cd Legacy-Zero--Autonomous-Migration-Foundry
      uv venv
      uv pip install langgraph langchain langchain-core langchain-openai tree-sitter tree-sitter-java pydantic python-dotenv tiktoken streamlit httpx
    note: Installs runtime dependencies directly into .venv, avoiding assumptions about the repository’s editable-package discovery. The next command uses uv run to select that environment without packaging.
  - label: 'Workflow illustration · no API key'
    requirements: Repository root and the environment created above.
    commands: |
      uv run --no-project --no-sync python -m src.orchestrator --mock
    note: Uses the built-in sample and synthetic translations. It illustrates voting/assembly, not semantically correct migration; it writes output.py in the checkout. Real translation requires your own API configuration in .env and omitting --mock.
evidence:
  - label: Orchestrator and mock behavior
    url: https://github.com/C6Sucrose/Legacy-Zero--Autonomous-Migration-Foundry/blob/68a7b6a233ffd58ebd3067215b1aef9f83422e51/src/orchestrator.py
    note: Shows how decomposition, generated tests, voting, and assembly are connected.
---
I explored the MAKER approach to long-horizon code migration: break a Java class into atomic methods, translate independently, use consensus to choose candidates, check them, then assemble a Python module.

My portfolio reports **96% syntax validity versus a 61% single-agent baseline**. That comparison is portfolio-reported; a reproducible benchmark artifact is not included in the inspected snapshot. The source is most useful for reviewing the orchestration idea and its current limitations, including the deliberately simplistic mock translations and generated-test dependence.
