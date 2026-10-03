"""
Fuller evaluation report: classification report + confusion matrix plot,
run against a freshly generated synthetic held-out set using already-trained
artifacts (run train.py first). Swap generate_synthetic_dataset for a real
held-out test set once you have one.
"""

from pathlib import Path
import numpy as np
import joblib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from sklearn.metrics import classification_report, confusion_matrix, ConfusionMatrixDisplay

from src.data.synthetic import generate_synthetic_dataset
from src.models.fusion_model import FusionRiskModel
from src.train import FEATURE_MODALITIES

ARTIFACTS_DIR = Path(__file__).resolve().parent.parent / 'artifacts'


def main():
    vectorizer = joblib.load(ARTIFACTS_DIR / 'text_vectorizer.joblib')
    text_model = joblib.load(ARTIFACTS_DIR / 'text_model.joblib')
    fusion: FusionRiskModel = joblib.load(ARTIFACTS_DIR / 'fusion_config.joblib')

    feature_models = {}
    for column in FEATURE_MODALITIES:
        modality_name = column.replace('_features', '')
        path = ARTIFACTS_DIR / f'{modality_name}_model.joblib'
        if path.exists():
            feature_models[modality_name] = joblib.load(path)

    df = generate_synthetic_dataset(n_subjects=200)

    X_text = vectorizer.transform(df['text'])
    modality_prob_arrays = {'text': text_model.predict_proba(X_text)}

    for column in FEATURE_MODALITIES:
        modality_name = column.replace('_features', '')
        probs = np.full(len(df), np.nan)
        model = feature_models.get(modality_name)
        if model is not None:
            has_feat = df[column].apply(lambda x: x is not None)
            if has_feat.any():
                X = np.stack(df.loc[has_feat, column].values)
                probs[has_feat.values] = model.predict_proba(X)
        modality_prob_arrays[modality_name] = probs

    results = fusion.fuse_batch(modality_prob_arrays, n=len(df))
    scores = np.array([r.risk_score for r in results])
    decisions = [r.decision for r in results]

    decided_mask = np.array([d != 'abstain_review_needed' for d in decisions])
    y_true = df['label'].values[decided_mask]
    y_pred = (scores[decided_mask] > 0.5).astype(int)

    print(f'Modalities with trained models: text, {list(feature_models.keys())}')
    print(f'Abstention rate: {np.mean(~decided_mask):.2%}')
    print(f'Cross-modal conflict rate: {np.mean([r.cross_modal_conflict for r in results]):.2%}')
    print('\nClassification report (decided cases only):')
    print(classification_report(y_true, y_pred, target_names=['low_risk', 'elevated_risk']))

    cm = confusion_matrix(y_true, y_pred)
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=['low_risk', 'elevated_risk'])
    disp.plot(cmap='Blues')
    plt.title('PsyFusion AI - Fused Decision Confusion Matrix (synthetic eval set)')
    out_path = ARTIFACTS_DIR / 'confusion_matrix.png'
    plt.savefig(out_path, dpi=150, bbox_inches='tight')
    print(f'\nConfusion matrix saved to {out_path}')


if __name__ == '__main__':
    main()
