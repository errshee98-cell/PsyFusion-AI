"""
Video/image data loading for the facial modality.

Two things live here:
1. `load_fer2013` - loads the FER2013 Kaggle CSV format (pixel strings + emotion
   label) for pretraining/baselining a facial-affect classifier.
2. `extract_frames_from_video` - samples evenly-spaced frames from a session
   video file (e.g. a DAIC-WOZ-style clinical interview recording, or a
   screening-flow video submitted through the app), which then go through
   face detection + feature extraction (see preprocessing/face_features.py).

FER2013 download: https://www.kaggle.com/datasets/msambare/fer2013 (free
Kaggle account). AffectNet requires its own request form to the dataset
authors - heavier-weight than FER2013, treat as a stretch goal.
"""

from pathlib import Path
import numpy as np
import pandas as pd
import cv2

FER2013_EMOTION_MAP = {
    0: 'angry', 1: 'disgust', 2: 'fear', 3: 'happy',
    4: 'sad', 5: 'surprise', 6: 'neutral',
}
# Coarse binary mapping for risk-screening purposes - not a clinical mapping,
# just a reasonable first cut distinguishing negative-affect expressions from
# neutral/positive ones. Revisit with a clinical advisor before trusting this.
_NEGATIVE_AFFECT = {'angry', 'disgust', 'fear', 'sad'}


def load_fer2013(csv_path: str) -> pd.DataFrame:
    """Returns a DataFrame with columns: image (48x48 uint8 np.ndarray), label (0/1)."""
    df = pd.read_csv(csv_path)
    images = []
    for pixel_str in df['pixels']:
        arr = np.array(pixel_str.split(), dtype=np.uint8).reshape(48, 48)
        images.append(arr)

    labels = df['emotion'].map(FER2013_EMOTION_MAP)
    binary_labels = labels.isin(_NEGATIVE_AFFECT).astype(int)

    return pd.DataFrame({
        'image': images,
        'label': binary_labels,
        'source': 'fer2013',
    })


def extract_frames_from_video(video_path: str, n_frames: int = 10) -> list:
    """Samples n_frames evenly spaced frames from a video file. Returns a list
    of BGR np.ndarray frames (OpenCV's native format) - convert to RGB in the
    feature extractor if needed."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise FileNotFoundError(f'Could not open video: {video_path}')

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total <= 0:
        cap.release()
        raise ValueError(f'Video has no readable frames: {video_path}')

    indices = np.linspace(0, total - 1, min(n_frames, total)).astype(int)
    frames = []
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ok, frame = cap.read()
        if ok:
            frames.append(frame)
    cap.release()
    return frames
