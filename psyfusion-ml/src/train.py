"""
Train the PsyFusion AI baseline multimodal risk model (text + audio + face).

Usage:
    # Smoke-test the whole pipeline on synthetic data (no real datasets needed):
    python -m src.train --synthetic

    # Train on real text data once downloaded (audio/face wiring for real
    # data is left to audio_loader.py / video_loader.py - see README.md):
    python -m src.train --text-csv data/raw/sdcnl.csv --text-col text --label-col is_suicide

Saves trained artifacts to artifacts/: text_vectorizer.joblib, text_model.joblib,
audio_model.joblib (if trained), face_model.joblib (if trained),
fusion_config.joblib, plus metrics.json summarizing held-out performance.
"""

import argparse
import json
from pathlib import Path

import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score

from src.data.synthetic import generate_synthetic_dataset
from src.preprocessing.text_preprocessing import TfidfTextVectorizer
from src.models.unimodal import TextRiskModel, FeatureVectorRiskModel
from src.models.fusion_model import FusionRiskModel

ARTIFACTS_DIR = Path(__file__).resolve().parent.parent / 'artifacts'

# Modalities whose preprocessing produces a fixed-length numeric feature
# vector per sample (as opposed to text, which has its own vectorizer).
# Add a new entry here (and to synthetic.py / your real loader) to extend
# the pipeline to another feature-vector modality later.
FEATURE_MODALITIES = ['audio_features', 'face_features']
MIN_ROWS_TO_TRAIN = 20


def build_dataset(args) -> 'pd.DataFrame':
    if args.synthetic or not args.text_csv:
        print('[train] Using synthetic data (no real dataset path given, or --synthetic set).')
        return generate_synthetic_dataset(n_subjects=args.n_synthetic)

    from src.data.text_loader import load_generic_csv
    df = load_generic_csv(args.text_csv, args.text_col, args.label_col, source_name='custom')
    for col in FEATURE_MODALITIES:
        df[col] = None
    return df


def train_feature_modality(column: str, train_df, test_df):
    """Trains a FeatureVectorRiskModel on `column` if there's enough non-null
    training data; returns (model_or_None, test_probs array with NaN where
    the modality was absent for that test row)."""
    has_train = train_df[column].apply(lambda x: x is not None)
    test_probs = np.full(len(test_df), np.nan)

    if has_train.sum() < MIN_ROWS_TO_TRAIN:
        print(f'[train] Not enough rows with {column} ({has_train.sum()}) to train - skipping modality.')
        return None, test_probs

    X_train = np.stack(train_df.loc[has_train, column].values)
    y_train = train_df.loc[has_train, 'label'].values
    model = FeatureVectorRiskModel()
    model.fit(X_train, y_train)

    has_test = test_df[column].apply(lambda x: x is not None)
    if has_test.any():
        X_test = np.stack(test_df.loc[has_test, column].values)
        test_probs[has_test.values] = model.predict_proba(X_test)

    return model, test_probs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--synthetic', action='store_true')
    parser.add_argument('--n-synthetic', type=int, default=600)
    parser.add_argument('--text-csv', type=str, default=None)
    parser.add_argument('--text-col', type=str, default='text')
    parser.add_argument('--label-col', type=str, default='label')
    parser.add_argument('--test-size', type=float, default=0.2)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    df = build_dataset(args)
    print(f'[train] Dataset size: {len(df)} rows, positive rate: {df.label.mean():.2%}')

    train_df, test_df = train_test_split(
        df, test_size=args.test_size, random_state=args.seed, stratify=df['label']
    )

    # --- Text modality (always present in our schema) ---
    vectorizer = TfidfTextVectorizer()
    X_text_train = vectorizer.fit_transform(train_df['text'])
    X_text_test = vectorizer.transform(test_df['text'])

    text_model = TextRiskModel()
    text_model.fit(X_text_train, train_df['label'])
    text_probs_test = text_model.predict_proba(X_text_test)

    modality_prob_arrays = {'text': text_probs_test}
    trained_models = {}

    # --- Audio + face modalities (feature-vector based, trained identically) ---
    for column in FEATURE_MODALITIES:
        modality_name = column.replace('_features', '')
        model, test_probs = train_feature_modality(column, train_df, test_df)
        if model is not None:
            trained_models[modality_name] = model
        modality_prob_arrays[modality_name] = test_probs

    # --- Fusion ---
    fusion = FusionRiskModel()
    results = fusion.fuse_batch(modality_prob_arrays, n=len(test_df))

    fused_scores = np.array([r.risk_score for r in results])
    decisions = [r.decision for r in results]
    abstain_rate = np.mean([d == 'abstain_review_needed' for d in decisions])
    conflict_rate = np.mean([r.cross_modal_conflict for r in results])
    modality_usage = {
        m: float(np.mean([m in r.modalities_used for r in results]))
        for m in modality_prob_arrays
    }

    # For a clean accuracy/F1 number, evaluate only on non-abstained cases -
    # abstained cases are, by design, routed to a human rather than scored.
    decided_mask = np.array([d != 'abstain_review_needed' for d in decisions])
    y_true_decided = test_df['label'].values[decided_mask]
    y_pred_decided = (fused_scores[decided_mask] > 0.5).astype(int)

    metrics = {
        'n_test': len(test_df),
        'abstain_rate': float(abstain_rate),
        'cross_modal_conflict_rate': float(conflict_rate),
        'modality_availability_in_test': modality_usage,
        'accuracy_on_decided_cases': float(accuracy_score(y_true_decided, y_pred_decided)) if decided_mask.any() else None,
        'f1_on_decided_cases': float(f1_score(y_true_decided, y_pred_decided)) if decided_mask.any() else None,
        'roc_auc_fused_score': float(roc_auc_score(test_df['label'], fused_scores)),
        'text_only_roc_auc': float(roc_auc_score(test_df['label'], text_probs_test)),
        'modalities_trained': list(trained_models.keys()) + ['text'],
    }
    print('[train] Held-out metrics:')
    print(json.dumps(metrics, indent=2))

    joblib.dump(vectorizer, ARTIFACTS_DIR / 'text_vectorizer.joblib')
    joblib.dump(text_model, ARTIFACTS_DIR / 'text_model.joblib')
    for modality_name, model in trained_models.items():
        joblib.dump(model, ARTIFACTS_DIR / f'{modality_name}_model.joblib')
    joblib.dump(fusion, ARTIFACTS_DIR / 'fusion_config.joblib')
    with open(ARTIFACTS_DIR / 'metrics.json', 'w') as f:
        json.dump(metrics, f, indent=2)

    print(f'[train] Artifacts saved to {ARTIFACTS_DIR}/')


if __name__ == '__main__':
    main()
