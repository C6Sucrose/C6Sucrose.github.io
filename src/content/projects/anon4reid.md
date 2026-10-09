---
title: ANON4REID
number: 1
summary: "How much privacy can you buy before person re-identification stops working?"
category: vision
depth: full
visibility: public
repo: https://github.com/C6Sucrose/anon4reid
revision: b095ae4ef45b8d094fcccd1ecb3f50912b90b6c3
reviewed: '2026-10-05'
status: Research benchmark · university team project
stack: [Python, PyTorch, Stable Diffusion, ControlNet, OSNet, MobileNetV2, Streamlit]
highlight: '4 methods'
highlightLabel: 'one privacy–utility question'
review:
  - path: src/anonymizer.py
    note: Shared resolution handling keeps the anonymization variants comparable.
  - path: src/rad_pipeline.py
    note: ControlNet OpenPose, Stable Diffusion, and LCM-LoRA pipeline.
  - path: src/evaluate_utility.py
    note: OSNet retrieval evaluation; inspect how mAP and CMC are measured.
  - path: src/evaluate_privacy.py
    note: Identity-attacker evaluation, separate from retrieval utility.
  - path: outputs/results/results_utility.json
    note: Recorded utility results used by this page; values in the file are ratios.
runs:
  - label: 'Clone · any terminal'
    requirements: Git and Python 3.10+; start in the parent folder where you keep projects.
    commands: |
      git clone https://github.com/C6Sucrose/anon4reid.git
      cd anon4reid
      python -m venv .venv
    note: The next commands assume you remain at the repository root. Model weights are included; image datasets are external.
  - label: 'Dashboard · Windows PowerShell'
    requirements: 'Repository root; virtual environment created above.'
    commands: |
      .\.venv\Scripts\python.exe -m pip install streamlit plotly pandas numpy pillow matplotlib
      .\.venv\Scripts\python.exe -m streamlit run app.py
    note: Lightweight dashboard dependencies are sufficient for the committed result tables. Sample comparison needs the Market-1501 folders. The absent baseline JSON leaves baseline-relative metrics unavailable; this website provides an immediate four-method explorer.
  - label: 'Dashboard · macOS / Linux'
    requirements: 'Repository root; virtual environment created above.'
    commands: |
      .venv/bin/python -m pip install streamlit plotly pandas numpy pillow matplotlib
      .venv/bin/python -m streamlit run app.py
    note: Open the local URL printed by Streamlit. Full regeneration needs the repository requirements, datasets, and CUDA-capable hardware for diffusion/training; use the reproduction guide for that longer path.
evidence:
  - label: Recorded utility results
    url: https://github.com/C6Sucrose/anon4reid/blob/b095ae4ef45b8d094fcccd1ecb3f50912b90b6c3/outputs/results/results_utility.json
    note: mAP and Rank-1 are converted from ratios to percentages in the explorer.
  - label: Recorded privacy results
    url: https://github.com/C6Sucrose/anon4reid/blob/b095ae4ef45b8d094fcccd1ecb3f50912b90b6c3/outputs/results/results_privacy.json
    note: Attacker Top-1 accuracy over 3,368 query images; lower means less identity recovery by this attacker.
  - label: Project report
    url: https://github.com/C6Sucrose/anon4reid/blob/b095ae4ef45b8d094fcccd1ecb3f50912b90b6c3/Project%20Report.pdf
    note: Methodology, baseline, findings, and research context.
---
## The question

Person re-identification tries to match the same person across cameras. Blurring a face might appear to protect an identity, but clothing and body shape still carry a lot of information. Our university project asked how much useful retrieval signal survives when images are anonymized more aggressively.

## What I worked on

My contribution covered anonymization pipelines, experiment evaluation, and communicating the results through the interactive dashboard and report. We compared Gaussian face blur, Stable Diffusion inpainting, ControlNet-based realistic anonymization by diffusion (RAD), and a Canny-edge representation on Market-1501.

The benchmark and its findings are **team work**: Huraira Ali, Jazib Aslam, Kazi Shafwanur Rehman, and Muhammad Umer Awan; AI Project, TH Deggendorf, summer semester 2026, supervised by Robert Aufschlaeger.

## Two tracks, not one score

- **Utility:** a pretrained OSNet retrieval model, measured with mAP and CMC / Rank-1.
- **Identity leakage:** a MobileNetV2 attacker trained to predict 750 identities, evaluated on anonymized query images.
- **Common basis:** 36,036 Market-1501 images, split consistently across the four anonymization variants.

The generative methods upscale the small images before processing and return them to the common resolution. GPU-oriented generation notebooks support resuming interrupted work.

## The trade-off was a cliff

Face blur retains substantial retrieval performance: **69.76% mAP**, while the attacker still identifies **88.658%** of queries. Body-level transformations sharply reduce both identity recovery and utility. RAD reaches approximately **0.148% mAP** and **0.1485% attacker accuracy** in the recorded run.

The report gives an unmodified baseline of **86.2% mAP**. Its baseline JSON is not present in the inspected GitHub snapshot, so the explorer below uses only the four committed method results. These findings describe this dataset and attacker; low measured leakage is not a general privacy guarantee.

## What I took away

A single headline metric would have hidden the central finding. Putting the two evaluations beside each other made the engineering choice visible: stronger anonymization removes much of the very appearance signal the retrieval model needs.
