# PsyFusion AI — ML Pipeline

Multimodal (text + audio + face) mental-health risk screening pipeline: data
loaders, preprocessing, baseline per-modality models, late fusion with
calibrated uncertainty + abstention, training/evaluation scripts, and a
single-sample inference interface for the backend to call.

## Status

This was built and smoke-tested in a sandboxed environment with **no internet
access** to pip/conda registries, so it uses only what was already available
there: `numpy`, `pandas`, `scikit-learn`, `matplotlib`, `joblib`, plus
`opencv-python` (a minimal build - see the face modality note below). The
full pipeline (`train.py` → `evaluate.py` → `inference.py`) was run
end-to-end on **synthetic text + audio + face data** and works correctly —
including a real video file run through real frame extraction and feature
extraction (not synthetic) — see `artifacts/metrics.json` and
`artifacts/confusion_matrix.png` for that run's output. The near-perfect
scores there are expected and meaningless: the synthetic generator makes
classes easy to separate on purpose, purely to prove the plumbing.
**Do not read those numbers as a real result.**

What hasn't been run here, because the data/libraries aren't reachable from
this environment:
- Training on any real dataset (SDCNL, Dreaddit, DAIC-WOZ, FER2013)
- Real audio feature extraction (`librosa` isn't installed here)
- Real face *detection* specifically — the OpenCV build here is missing
  `CascadeClassifier` (see below); feature extraction around it was tested
  for real, detection itself was not.

Run this locally with internet access before trusting any real numbers.

### Face modality note

`src/preprocessing/face_features.py` uses OpenCV's bundled Haar cascade for
face detection, which needs **no download** on a normal
`pip install opencv-python`. This build environment's OpenCV happened to be
a minimal/headless build missing that (and missing MediaPipe's legacy
`solutions` API, and missing `HOGDescriptor`) — so face detection itself
fell back to using the full frame, which the code does automatically and
loudly (a one-time warning), rather than crashing. **On your machine with a
normal OpenCV install, real face detection should just work** — but verify
that assumption by running `python -m src.inference --video-path <a real
clip>` locally and checking the console doesn't print the cascade-fallback
warning.

Feature extraction itself (histogram, edge density, gradient stats — not a
trained emotion classifier, see Design choices below) runs on whatever
region detection hands it, so it was fully exercised end-to-end here, just
on full frames instead of cropped faces.

## Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Getting the datasets

| Dataset | Used for | Access |
|---|---|---|
| [SDCNL](https://www.kaggle.com/datasets/hereisburak/suicide-depression-detection) (Kaggle) | text baseline | free Kaggle account, download CSV to `data/raw/sdcnl.csv` |
| [Dreaddit](https://www.kaggle.com/datasets/kanishkasharma/dreaddit) (Kaggle) | text baseline | same as above, `data/raw/dreaddit.csv` |
| [DAIC-WOZ / E-DAIC](https://dcapswoz.ict.usc.edu/) | audio + clinical PHQ-8 labels | requires signing USC's data use agreement — request access on that page; approval can take a couple of weeks, start early |
| [CLPsych shared task data](https://clpsych.org/) | text, risk severity | requires registering for the relevant shared task year + an ethics/DUA step |
| [FER2013](https://www.kaggle.com/datasets/msambare/fer2013) (Kaggle) | face baseline | free Kaggle account, download CSV to `data/raw/fer2013.csv` |
| AffectNet | face, stretch goal | requires a request form to the dataset authors — heavier-weight than FER2013, treat as optional |

Drop downloaded files into `data/raw/` following the layout each loader
expects (see docstrings in `src/data/text_loader.py`,
`src/data/audio_loader.py`, `src/data/video_loader.py`).

## Running it

```bash
# 1. Smoke-test on synthetic data (works right now, no datasets needed):
python -m src.train --synthetic
python -m src.evaluate

# 2. Try a single prediction (any combination of modalities):
python -m src.inference --text "haven't been sleeping well lately"
python -m src.inference --text "..." --audio-path clip.wav --video-path clip.mp4

# 3. Once you have real data, train on it instead:
python -m src.train --text-csv data/raw/sdcnl.csv --text-col text --label-col is_suicide
```

Note the `-m src.xxx` form (not `python src/train.py` directly) — the
scripts import from the `src` package, so they need to run as modules from
the repo root.

## Design choices worth knowing about

- **TF-IDF, not transformer embeddings, for the text baseline.** No internet
  access here to download pretrained weights. `src/preprocessing/text_preprocessing.py`
  is written as a swappable interface (`fit_transform`/`transform`) — plug in
  a sentence-transformer embedder later without touching `train.py`.
- **Statistical/texture features, not a trained CNN, for the face baseline.**
  Same reasoning as text: no internet access to download pretrained emotion-
  classifier weights. `face_features.py` extracts a histogram + edge-density +
  gradient-statistics vector from the detected face region instead. This is a
  weak proxy for real facial affect — the natural upgrade is to train a small
  CNN from scratch on FER2013 (small enough, 48x48 grayscale, to train
  without any pretrained weights at all) once your team has GPU/internet
  access.
- **Calibrated probabilities everywhere** (`CalibratedClassifierCV`), because
  the fusion and abstention logic are meaningless if the per-modality scores
  aren't actually calibrated probabilities.
- **Audio and face share one model class** (`FeatureVectorRiskModel` in
  `models/unimodal.py`) since both are "RandomForest on a fixed-length
  numeric feature vector, with NaN-imputation for failed extractions" — the
  only thing that differs is the feature extractor feeding them. Extending to
  a fourth feature-vector modality later (a cognitive-task score, say) means
  adding one entry to `FEATURE_MODALITIES` in `train.py`, not writing a new
  model class.
- **Fusion is N-way and generic** (`src/models/fusion_model.py`), not
  hardcoded to two modalities. It implements three things the team's
  research report flagged as differentiators:
  - missing-modality robustness (renormalizes weights over whichever
    modalities are present for a given subject - any subset, including just
    one)
  - cross-modal conflict detection (flags when present modalities disagree
    sharply - measured as max pairwise difference)
  - abstention on uncertain scores (routes to human review instead of
    forcing a binary decision)

## Serving it over HTTP (`service/app.py`)

`service/app.py` wraps `PsyFusionPredictor` in a small internal HTTP API so
the Node backend calls it instead of shelling out to a Python process. See
the module docstring for the full design (why Flask instead of the
originally-planned FastAPI, the shared-secret auth model, etc.) — short
version:

```bash
pip install -r requirements.txt   # needs flask
export ML_SERVICE_API_KEY="<shared secret - must match the Node backend's ML_SERVICE_API_KEY>"
python -m service.app              # dev server on :8000
```

`GET /health` → `{status, artifacts_loaded, modalities_available}` (no auth
required, for liveness checks). `POST /predict` → JSON `{"text": "..."}` or
`multipart/form-data` with `text` + optional `audio`/`video` files, requires
the `X-Internal-Api-Key` header, returns the same shape `predict()` already
returns, plus `latency_ms`.

**Verified in this sandbox** (fastapi/uvicorn could not be installed — pip
confirmed no registry access — so this was built against Flask, which *was*
preinstalled, and actually run, not just syntax-checked): started the
service against the synthetic-trained artifacts in `artifacts/`, then over
real HTTP with `curl`: `/health` reporting all three modalities loaded;
`/predict` with text only (both an ordinary and a crisis-language input);
missing/wrong `X-Internal-Api-Key` correctly rejected with 401; empty text
rejected with 400; a real generated `.mp4` uploaded via
`multipart/form-data` for the `video` field, correctly ran through frame
extraction → face model → fusion and returned a result with
`modalities_used: ["text", "face"]`; an upload with a disallowed extension
rejected with 400; temp files for uploads confirmed deleted after the
request. Not verified here: concurrent load, a real WSGI server in front
(gunicorn isn't installed in this sandbox either - see the module
docstring), or calling it from the actual Node backend (that integration is
documented and code-complete in `psyfusion-backend/src/services/mlServiceClient.js`,
but the two have not been run against each other in this sandbox since the
Node backend's dependencies were never installable here either).

## What's NOT yet built (next steps)

- Training on any real dataset — this is the most important next step.
- Real face detection has not been verified locally (see Face modality note
  above) — do that before trusting the face modality at all.
- Cognitive-task modality mentioned in the project overview — still not
  covered; would follow the same `FeatureVectorRiskModel` pattern as
  audio/face.
- Subgroup fairness reporting and evidence-provenance logging (both called
  out as differentiators in the research report, not yet implemented here).
- Hyperparameter tuning — current models use reasonable defaults, not a
  tuned configuration.
- Unit tests (`tests/` folder exists but is empty).

## Folder structure

```
src/
  data/           text_loader.py, audio_loader.py, video_loader.py, synthetic.py
  preprocessing/  text_preprocessing.py, audio_features.py, face_features.py
  models/         unimodal.py (per-modality), fusion_model.py (N-way fusion)
  train.py        trains + saves artifacts
  evaluate.py     fuller report + confusion matrix plot
  inference.py    single-sample prediction (what the backend calls)
service/
  app.py          Flask HTTP wrapper around inference.py (see above)
configs/
  config.yaml     dataset paths, fusion hyperparameters
data/raw/         put downloaded datasets here (gitignored)
artifacts/        saved models + metrics (gitignored, generated by train.py)
```
