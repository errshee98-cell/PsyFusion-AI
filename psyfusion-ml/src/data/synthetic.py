"""
Synthetic multimodal data generator.

Lets us build, test, and demo the full pipeline (preprocessing -> per-modality
models -> fusion -> inference) before the real datasets (DAIC-WOZ, SDCNL,
Dreaddit, etc.) are downloaded and DUAs signed. Nothing learned from this
synthetic data should ever be treated as a real result - it exists purely to
prove the plumbing works and to give every team member something to run
against immediately.

Generates two aligned views per synthetic subject:
    - text: short strings, with higher-risk subjects more likely to contain
      a small set of "distress" tokens (crude, deliberately simple)
    - audio_features: a fixed-length numeric vector standing in for what a
      real MFCC/prosodic feature extractor would produce (see
      preprocessing/audio_features.py for the real extractor interface)
"""

import numpy as np
import pandas as pd

RNG = np.random.default_rng(42)

_LOW_RISK_PHRASES = [
    "had a good day at work today",
    "going for a run this evening",
    "excited about the weekend plans",
    "finished a big project, feeling proud",
    "caught up with an old friend",
]

_HIGH_RISK_PHRASES = [
    "can't sleep again, everything feels heavy",
    "so tired of pretending i'm okay",
    "nothing feels worth it anymore",
    "haven't left my room in days",
    "feel like a burden to everyone",
]


def generate_synthetic_dataset(n_subjects: int = 400, audio_feature_dim: int = 40,
                                face_feature_dim: int = 21,
                                missing_modality_rate: float = 0.15) -> pd.DataFrame:
    """
    Returns a DataFrame with columns:
        subject_id, text, audio_features (object: np.ndarray or None),
        face_features (object: np.ndarray or None), label

    `missing_modality_rate` is applied independently to audio and to face,
    so the fusion model's missing-modality handling (including both absent
    at once, leaving only text) gets exercised, not just the happy path.
    face_feature_dim defaults to 21 to match face_features.extract_features_from_frame's
    real output shape (16-bin histogram + 5 statistical features).
    """
    rows = []
    for i in range(n_subjects):
        label = int(RNG.random() < 0.35)  # ~35% positive class, roughly matches
                                           # typical clinical screening prevalence

        phrase_pool = _HIGH_RISK_PHRASES if label == 1 else _LOW_RISK_PHRASES
        # add a little label noise so the task isn't trivially separable
        if RNG.random() < 0.1:
            phrase_pool = _LOW_RISK_PHRASES if label == 1 else _HIGH_RISK_PHRASES
        text = RNG.choice(phrase_pool)

        # audio features: label-correlated mean shift + noise, standing in for
        # real prosodic features (e.g. lower pitch variance, slower speech rate
        # are reported correlates of depressed affect in the literature)
        audio_features = RNG.normal(loc=0.0, scale=1.0, size=audio_feature_dim)
        audio_features += 0.6 if label == 1 else -0.2
        if RNG.random() < missing_modality_rate:
            audio_features = None

        # face features: same label-correlated-shift idea, independent noise
        # and independent missingness from audio
        face_features = RNG.normal(loc=0.0, scale=1.0, size=face_feature_dim)
        face_features += 0.5 if label == 1 else -0.15
        if RNG.random() < missing_modality_rate:
            face_features = None

        rows.append({
            'subject_id': f'synthetic_{i:04d}',
            'text': text,
            'audio_features': audio_features,
            'face_features': face_features,
            'label': label,
        })

    return pd.DataFrame(rows)
