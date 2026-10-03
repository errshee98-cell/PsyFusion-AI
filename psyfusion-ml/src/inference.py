"""
Inference wrapper: loads trained artifacts and scores a single subject's
text, and optionally audio and/or a video/image for the face modality. This
is the function a backend service would call - either directly (if the
backend is Python) or wrapped behind a small FastAPI/Flask endpoint that the
Node backend calls over HTTP (recommended: keeps the Node backend's
dependency surface unchanged and lets the ML side scale/deploy
independently).

Usage:
    python -m src.inference --text "haven't been sleeping well lately"
    python -m src.inference --text "..." --audio-path clip.wav --video-path clip.mp4
"""

import argparse
import json
from pathlib import Path

import joblib

from src.models.fusion_model import FusionRiskModel

ARTIFACTS_DIR = Path(__file__).resolve().parent.parent / 'artifacts'


class PsyFusionPredictor:
    def __init__(self, artifacts_dir: Path = ARTIFACTS_DIR):
        self.vectorizer = joblib.load(artifacts_dir / 'text_vectorizer.joblib')
        self.text_model = joblib.load(artifacts_dir / 'text_model.joblib')

        audio_path = artifacts_dir / 'audio_model.joblib'
        self.audio_model = joblib.load(audio_path) if audio_path.exists() else None

        face_path = artifacts_dir / 'face_model.joblib'
        self.face_model = joblib.load(face_path) if face_path.exists() else None

        fusion_path = artifacts_dir / 'fusion_config.joblib'
        self.fusion: FusionRiskModel = joblib.load(fusion_path) if fusion_path.exists() else FusionRiskModel()

    def predict(self, text: str, audio_path: str | None = None,
                video_path: str | None = None) -> dict:
        X_text = self.vectorizer.transform([text])
        modality_probs = {'text': float(self.text_model.predict_proba(X_text)[0])}

        if audio_path is not None:
            if self.audio_model is None:
                print('[inference] WARNING: audio provided but no audio model is trained; ignoring audio.')
                modality_probs['audio'] = None
            else:
                from src.preprocessing.audio_features import extract_features_from_file
                features = extract_features_from_file(audio_path).reshape(1, -1)
                modality_probs['audio'] = float(self.audio_model.predict_proba(features)[0])
        else:
            modality_probs['audio'] = None

        if video_path is not None:
            if self.face_model is None:
                print('[inference] WARNING: video provided but no face model is trained; ignoring video.')
                modality_probs['face'] = None
            else:
                from src.preprocessing.face_features import batch_extract_from_video
                features = batch_extract_from_video(video_path).reshape(1, -1)
                modality_probs['face'] = float(self.face_model.predict_proba(features)[0])
        else:
            modality_probs['face'] = None

        result = self.fusion.fuse_one(modality_probs)

        return {
            'risk_score': round(result.risk_score, 4),
            'decision': result.decision,
            'modalities_used': result.modalities_used,
            'cross_modal_conflict': result.cross_modal_conflict,
            'conflict_magnitude': (
                round(result.conflict_magnitude, 4) if result.conflict_magnitude is not None else None
            ),
            'per_modality_scores': {k: round(v, 4) for k, v in result.per_modality_scores.items()},
            # Decision copy for a frontend/clinician dashboard to show directly -
            # keep this calibrated to how your clinical advisor wants it worded.
            'explanation': _explain(result),
        }


def _explain(result) -> str:
    if result.decision == 'abstain_review_needed':
        return 'Score is in an uncertain range. Flagged for clinician review rather than an automated decision.'
    if result.cross_modal_conflict:
        return (
            f"Modalities disagreed ({', '.join(result.modalities_used)}); "
            'score reflects a weighted average but this case may warrant a closer look.'
        )
    if result.decision == 'elevated_risk':
        return 'Elevated risk indicators detected across available modalities.'
    return 'No elevated risk indicators detected in available modalities.'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--text', type=str, required=True)
    parser.add_argument('--audio-path', type=str, default=None)
    parser.add_argument('--video-path', type=str, default=None)
    args = parser.parse_args()

    predictor = PsyFusionPredictor()
    result = predictor.predict(args.text, args.audio_path, args.video_path)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
