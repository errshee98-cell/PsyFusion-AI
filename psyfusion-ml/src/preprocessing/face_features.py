"""
Face detection + feature extraction for the facial/video modality.

Detection: OpenCV's Haar cascade face detector (`cv2.CascadeClassifier`),
which ships bundled inside the `opencv-python` wheel - no model download
required. This is the standard, zero-download face detector; if your
environment's OpenCV build is missing the `objdetect` module (some minimal/
headless builds are - this was true in the sandbox this was built in),
`detect_face_bbox` falls back to using the full frame and logs a warning
once, so the rest of the pipeline still runs in degraded mode rather than
crashing. Swap in a DNN face detector (`cv2.FaceDetectorYN`, needs a
downloaded .onnx model) for better accuracy once you have internet access.

Features: deliberately NOT a pretrained emotion classifier, since that would
need downloaded weights we can't guarantee are reachable. Instead this
extracts classic, cheap statistical/texture features from the detected face
region (intensity histogram, edge density, gradient statistics) as a
baseline. This is a weak proxy for facial affect - the natural upgrade once
your team has GPU/internet access is to train a small CNN from scratch on
FER2013 (see data/video_loader.py::load_fer2013), since FER2013 is small
enough (48x48 grayscale) to train without any pretrained weights at all.
"""

import numpy as np
import cv2

_cascade = None
_cascade_unavailable_warned = False


def _get_cascade():
    global _cascade, _cascade_unavailable_warned
    if _cascade is not None:
        return _cascade
    try:
        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        clf = cv2.CascadeClassifier(cascade_path)
        if clf.empty():
            raise RuntimeError('Cascade file failed to load')
        _cascade = clf
    except Exception as exc:  # noqa: BLE001 - deliberately broad: fall back, don't crash
        if not _cascade_unavailable_warned:
            print(
                f'[face_features] WARNING: face cascade unavailable ({exc}). '
                'Falling back to using the full frame as the "face" region. '
                'This happens on minimal/headless OpenCV builds missing objdetect; '
                'a standard `pip install opencv-python` should have it.'
            )
            _cascade_unavailable_warned = True
        _cascade = False
    return _cascade


def detect_face_bbox(frame: np.ndarray):
    """Returns (x, y, w, h) of the largest detected face, or None if no
    cascade is available / no face found (caller should fall back to the
    full frame in that case)."""
    cascade = _get_cascade()
    if not cascade:
        return None

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
    if len(faces) == 0:
        return None
    # pick the largest face by area, in case of multiple detections
    return max(faces, key=lambda f: f[2] * f[3])


def extract_features_from_frame(frame: np.ndarray, size: int = 48) -> np.ndarray:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    bbox = detect_face_bbox(frame)
    if bbox is not None:
        x, y, w, h = bbox
        face = gray[y:y + h, x:x + w]
    else:
        face = gray  # degraded mode: whole frame

    face = cv2.resize(face, (size, size))

    hist = cv2.calcHist([face], [0], None, [16], [0, 256]).flatten()
    hist = hist / (hist.sum() + 1e-8)  # normalize to a distribution

    edges = cv2.Canny(face, 50, 150)
    edge_density = float(edges.mean() / 255.0)

    sobel_x = cv2.Sobel(face, cv2.CV_64F, 1, 0, ksize=3)
    sobel_y = cv2.Sobel(face, cv2.CV_64F, 0, 1, ksize=3)
    grad_mag = np.sqrt(sobel_x ** 2 + sobel_y ** 2)

    stats = np.array([
        face.mean() / 255.0,
        face.std() / 255.0,
        edge_density,
        grad_mag.mean() / 255.0,
        grad_mag.std() / 255.0,
    ])

    return np.concatenate([hist, stats]).astype(np.float32)


def batch_extract_from_video(video_path: str, n_frames: int = 10) -> np.ndarray:
    """Extracts per-frame features across sampled frames and returns the
    mean feature vector - a simple temporal aggregation. A sequence model
    (e.g. an LSTM over per-frame features) is a natural upgrade once you
    have enough labeled video data to justify it."""
    from src.data.video_loader import extract_frames_from_video

    frames = extract_frames_from_video(video_path, n_frames=n_frames)
    if not frames:
        raise ValueError(f'No frames extracted from {video_path}')

    per_frame = np.stack([extract_features_from_frame(f) for f in frames])
    return per_frame.mean(axis=0)
