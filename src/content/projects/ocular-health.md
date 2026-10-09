---
title: Ocular Health
number: 6
summary: Fundus-image classification and CycleGAN image translation, with attention to the data pipeline.
category: vision
depth: compact
visibility: public
repo: https://github.com/C6Sucrose/Ocular-Health-Analysis-and-Generation
revision: 92f34d1985538c167151c248a672a7f6f48269dc
reviewed: '2026-10-05'
status: Deep-learning research · data/model preparation required
stack: [Python, PyTorch, EfficientNet-B0, CycleGAN, Jupyter]
highlight: '10 classes'
highlightLabel: 'ocular-image classification'
review:
  - path: train_efficientnetlrsched_augmented.py
    note: Inspect augmentation, normalization, the classifier head, scheduler, and stopping/checkpoint criteria.
  - path: cyclegan-for-dga-of-ocular-health.ipynb
    note: Review the unpaired generative pipeline and its data assumptions.
  - path: preprocessing scripts/datasplits.py
    note: Check how the source images are organized into train/validation partitions.
runs:
  - label: 'Open the research workspace'
    requirements: Git, Python, and a compatible PyTorch environment. Start in your projects folder.
    commands: |
      git clone https://github.com/C6Sucrose/Ocular-Health-Analysis-and-Generation.git
      cd Ocular-Health-Analysis-and-Generation
      python -m venv .venv
    note: Begin with the linked notebook and training code. The inspected repository contains an EfficientNet checkpoint, but not the GUI binaries mentioned by its README.
  - label: 'Training entry point · after data/environment setup'
    requirements: Activate your compatible PyTorch environment. Prepare preprocessed_images/train and preprocessed_images/val with class folders, using the repository data documentation. GPU recommended.
    commands: |
      python train_efficientnetlrsched_augmented.py
    note: This is a training workflow, not a one-command inference demo. Dependencies are unpinned and scheduler APIs vary by PyTorch release; review the training script against your environment first. The notebook is the most direct no-install code-review route.
evidence:
  - label: Classification training code
    url: https://github.com/C6Sucrose/Ocular-Health-Analysis-and-Generation/blob/92f34d1985538c167151c248a672a7f6f48269dc/train_efficientnetlrsched_augmented.py
    note: Implements a 10-class EfficientNet-B0 training workflow.
  - label: CycleGAN notebook
    url: https://github.com/C6Sucrose/Ocular-Health-Analysis-and-Generation/blob/92f34d1985538c167151c248a672a7f6f48269dc/cyclegan-for-dga-of-ocular-health.ipynb
    note: Generative image-translation research, not a clinical decision system.
---
I worked on classification and generative analysis of color fundus images: preparing and labeling the data, training EfficientNet-B0, and exploring diseased-to-healthy-looking translation with CycleGAN.

The CV describes work across 45,000+ images and reports 98.32% balanced accuracy. Those are **CV-reported results**; the linked source is the available review evidence. The generative images are research outputs, not a medical diagnosis or proof of a healthy eye.
