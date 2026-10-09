---
title: NASA Kepler
number: 5
summary: Classifying Kepler observations with a held-out evaluation, feature selection, and a simpler baseline.
category: tooling
depth: compact
visibility: public
repo: https://github.com/C6Sucrose/NASA-Kepler-Object-Classification-Pipeline
revision: e2aa41bf45935ec4e81e5f741f99ac11b91dc8f5
reviewed: '2026-10-05'
status: Reproducible tabular-ML study · dataset included
stack: [Python, Pandas, NumPy, scikit-learn, Matplotlib, Seaborn]
highlight: '87.74%'
highlightLabel: 'recorded test balanced accuracy'
review:
  - path: ml_project.py
    note: Inspect the stratified split, training-fitted scaler, feature selection, and model search.
  - path: ml_evaluation_results.txt
    note: Random Forest 0.8774 balanced accuracy against GaussianNB 0.7964 on 743 held-out samples.
runs:
  - label: 'Prepare · any terminal'
    requirements: Git and Python3. Start in your projects folder; no GPU or service account required.
    commands: |
      git clone https://github.com/C6Sucrose/NASA-Kepler-Object-Classification-Pipeline.git
      cd NASA-Kepler-Object-Classification-Pipeline
      python -m venv .venv
    note: The raw CSV and recorded evaluation are included. The repository requirements list includes os, a standard-library module; install the actual third-party dependencies below instead.
  - label: 'Run · Windows PowerShell'
    requirements: Repository root, virtual environment created.
    commands: |
      .\.venv\Scripts\python.exe -m pip install pandas numpy matplotlib seaborn scikit-learn
      .\.venv\Scripts\python.exe ml_project.py
    note: Runs preprocessing/model search and generates evaluation output. Plot windows may need closing to let the script continue; runtime depends on CPU and dependency versions.
  - label: 'Run · macOS / Linux'
    requirements: Repository root, virtual environment created.
    commands: |
      .venv/bin/python -m pip install pandas numpy matplotlib seaborn scikit-learn
      .venv/bin/python ml_project.py
    note: For a fast review, inspect the included evaluation log before rerunning the full model search.
evidence:
  - label: Held-out evaluation log
    url: https://github.com/C6Sucrose/NASA-Kepler-Object-Classification-Pipeline/blob/e2aa41bf45935ec4e81e5f741f99ac11b91dc8f5/ml_evaluation_results.txt
    note: 87.74% test balanced accuracy, 79.64% GaussianNB baseline, test set of 743 rows.
---
This pipeline starts with 9,565 Kepler observations and produces a cleaned 4,950-row dataset. It uses stratified training/validation/test splits, training-based scaling, feature selection, and GridSearchCV to compare a family of classifiers.

The committed evaluation selects Random Forest at **87.74% test balanced accuracy**, versus **79.64% for GaussianNB** — an 8.10 percentage-point improvement. A later XGBoost iteration reported in my CV reached 98.97%, but that experiment is outside this repository. The figures here are the ones backed by the committed output.
