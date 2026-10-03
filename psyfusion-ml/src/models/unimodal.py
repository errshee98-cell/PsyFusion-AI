"""
Per-modality baseline classifiers.

Both wrap scikit-learn estimators with probability calibration
(CalibratedClassifierCV), because the fusion layer and the abstention logic
both depend on probabilities actually meaning something, not just being a
confident-looking number from an uncalibrated model.
"""

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline


class TextRiskModel:
    def __init__(self, calibration_method: str = 'sigmoid', cv: int = 3):
        base = LogisticRegression(max_iter=1000, class_weight='balanced')
        self.model = CalibratedClassifierCV(base, method=calibration_method, cv=cv)

    def fit(self, X, y):
        self.model.fit(X, y)
        return self

    def predict_proba(self, X) -> np.ndarray:
        """Returns P(label=1) per row."""
        return self.model.predict_proba(X)[:, 1]


class FeatureVectorRiskModel:
    """RandomForest-on-fixed-length-features baseline. Used for any modality
    whose preprocessing produces a numeric feature vector per sample - audio
    (MFCC/prosodic features) and face (statistical/texture features) both
    use this same class. NaN rows (failed feature extraction for a given
    sample) are mean-imputed rather than dropped."""

    def __init__(self, calibration_method: str = 'sigmoid', cv: int = 3, n_estimators: int = 200):
        base = RandomForestClassifier(
            n_estimators=n_estimators, class_weight='balanced', random_state=42
        )
        self.pipeline = Pipeline([
            ('impute', SimpleImputer(strategy='mean')),
            ('clf', CalibratedClassifierCV(base, method=calibration_method, cv=cv)),
        ])

    def fit(self, X, y):
        self.pipeline.fit(X, y)
        return self

    def predict_proba(self, X) -> np.ndarray:
        return self.pipeline.predict_proba(X)[:, 1]


# Named aliases - same implementation, kept as separate names so train.py /
# inference.py read clearly about which modality each trained model is for,
# and so each gets its own saved artifact file (audio_model.joblib vs
# face_model.joblib) without the class name forcing that.
AudioRiskModel = FeatureVectorRiskModel
FaceRiskModel = FeatureVectorRiskModel
