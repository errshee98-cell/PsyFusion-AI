"""
Audio feature extraction.

Real extraction (extract_features_from_file) requires `librosa`, which isn't
installed in this build environment - install it via requirements.txt when
running locally. The function fails loudly and clearly if librosa is missing,
rather than silently returning garbage.

Produces a fixed-length feature vector per audio file: MFCCs (mean + std),
plus basic prosodic features (pitch, zero-crossing rate, RMS energy) that
the depression/affect-detection literature commonly uses as correlates.
"""

import numpy as np


def extract_features_from_file(audio_path: str, n_mfcc: int = 13, sr: int = 16000) -> np.ndarray:
    try:
        import librosa
    except ImportError as exc:
        raise ImportError(
            "librosa is required for real audio feature extraction. "
            "Install it with `pip install librosa` (see requirements.txt). "
            "If you're just testing the pipeline shape, use "
            "src/data/synthetic.py instead."
        ) from exc

    y, _ = librosa.load(audio_path, sr=sr, mono=True)

    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc)
    mfcc_mean = mfcc.mean(axis=1)
    mfcc_std = mfcc.std(axis=1)

    zcr = librosa.feature.zero_crossing_rate(y).mean()
    rms = librosa.feature.rms(y=y).mean()

    f0, voiced_flag, _ = librosa.pyin(
        y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7')
    )
    f0_voiced = f0[voiced_flag] if voiced_flag is not None else np.array([])
    pitch_mean = float(np.nanmean(f0_voiced)) if f0_voiced.size else 0.0
    pitch_std = float(np.nanstd(f0_voiced)) if f0_voiced.size else 0.0

    features = np.concatenate([
        mfcc_mean, mfcc_std,
        [zcr, rms, pitch_mean, pitch_std],
    ])
    return features.astype(np.float32)


def batch_extract(audio_paths: list[str], **kwargs) -> np.ndarray:
    """Extract features for a list of audio files, returning a 2D array.
    Rows that fail extraction are filled with NaN and a warning is printed -
    the caller decides how to handle missing rows (impute, drop, or treat
    as a missing modality for that subject)."""
    feats = []
    for path in audio_paths:
        try:
            feats.append(extract_features_from_file(path, **kwargs))
        except Exception as exc:  # noqa: BLE001 - we want to continue the batch
            print(f'[audio_features] WARNING: failed on {path}: {exc}')
            feats.append(None)

    dim = next((f.shape[0] for f in feats if f is not None), 30)
    return np.array([f if f is not None else np.full(dim, np.nan) for f in feats])
