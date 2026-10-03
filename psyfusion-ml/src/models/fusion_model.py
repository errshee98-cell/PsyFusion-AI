"""
Late-fusion risk model - generic across any number of modalities.

Combines calibrated per-modality probabilities into a single risk score,
implementing three differentiators from the PsyFusion AI design (see
project overview):

1. Missing-modality robustness - fusion renormalizes weights over whichever
   modalities are actually present for a given subject, rather than
   erroring or imputing a fake value for an absent one.
2. Cross-modal conflict detection - when present modalities disagree
   sharply (measured as the max pairwise difference among them), that's
   flagged separately so a clinician sees *why* a case needs attention.
3. Calibrated uncertainty with abstention - scores inside an "uncertain"
   band near 0.5 are not forced into a binary decision; they're routed to
   human review instead.

Simple, auditable weighted-average fusion. A learned meta-fusion model
(stacking) is a natural upgrade once there's enough real multimodal
training data to fit one without overfitting.
"""

from dataclasses import dataclass, field
import numpy as np


@dataclass
class FusionResult:
    risk_score: float          # 0-1, calibrated probability of elevated risk
    decision: str              # "low_risk" | "elevated_risk" | "abstain_review_needed"
    modalities_used: list
    cross_modal_conflict: bool
    conflict_magnitude: float | None
    per_modality_scores: dict = field(default_factory=dict)


class FusionRiskModel:
    def __init__(self, weights: dict = None,
                 abstain_lower: float = 0.40, abstain_upper: float = 0.60,
                 conflict_threshold: float = 0.35):
        # Default: equal weight across the three modalities this pipeline
        # currently supports. Rebalance once you have real validation data
        # showing one modality is more reliable than another.
        self.weights = weights or {'text': 1 / 3, 'audio': 1 / 3, 'face': 1 / 3}
        self.abstain_lower = abstain_lower
        self.abstain_upper = abstain_upper
        self.conflict_threshold = conflict_threshold

    def fuse_one(self, modality_probs: dict) -> FusionResult:
        """modality_probs: dict like {'text': 0.7, 'audio': None, 'face': 0.3}
        - None/absent keys are treated as that modality being unavailable
        for this subject."""
        present = {m: p for m, p in modality_probs.items() if p is not None}

        if not present:
            raise ValueError('At least one modality must be present to fuse.')

        present_weights = {m: self.weights.get(m, 0.0) for m in present}
        total_weight = sum(present_weights.values())
        if total_weight <= 0:
            # weights dict didn't cover the present modalities - fall back to equal weight
            present_weights = {m: 1.0 for m in present}
            total_weight = float(len(present))
        normalized_weights = {m: w / total_weight for m, w in present_weights.items()}

        score = sum(normalized_weights[m] * present[m] for m in present)

        conflict = False
        conflict_magnitude = None
        if len(present) >= 2:
            values = list(present.values())
            conflict_magnitude = max(values) - min(values)
            conflict = conflict_magnitude >= self.conflict_threshold

        if self.abstain_lower <= score <= self.abstain_upper:
            decision = 'abstain_review_needed'
        elif score > self.abstain_upper:
            decision = 'elevated_risk'
        else:
            decision = 'low_risk'

        return FusionResult(
            risk_score=float(score),
            decision=decision,
            modalities_used=list(present.keys()),
            cross_modal_conflict=conflict,
            conflict_magnitude=conflict_magnitude,
            per_modality_scores=present,
        )

    def fuse_batch(self, modality_prob_arrays: dict, n: int) -> list:
        """modality_prob_arrays: dict like {'text': np.ndarray, 'audio': np.ndarray}
        where each array has length n and NaN marks a missing value for that row."""
        results = []
        for i in range(n):
            row_probs = {}
            for modality, arr in modality_prob_arrays.items():
                if arr is None:
                    row_probs[modality] = None
                else:
                    val = arr[i]
                    row_probs[modality] = None if (val is None or np.isnan(val)) else float(val)
            results.append(self.fuse_one(row_probs))
        return results
