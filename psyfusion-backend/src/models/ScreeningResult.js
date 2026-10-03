const mongoose = require('mongoose');

/**
 * One multimodal screening submission + the ML service's result.
 *
 * `textSnapshot` is sensitive clinical input, so it's excluded from default
 * queries (`select: false`) the same way passwordHash/refreshTokenHashes are
 * on User - callers must opt in with `.select('+textSnapshot')` and should
 * only do that for the owning user or a clinician/admin reviewing a flagged
 * case, never for a general listing.
 */
const screeningResultSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    textSnapshot: { type: String, required: true, select: false, maxlength: 4000 },
    hadAudio: { type: Boolean, default: false },
    hadVideo: { type: Boolean, default: false },

    riskScore: { type: Number, required: true, min: 0, max: 1 },
    decision: {
      type: String,
      enum: ['low_risk', 'elevated_risk', 'abstain_review_needed'],
      required: true,
    },
    modalitiesUsed: [{ type: String }],
    crossModalConflict: { type: Boolean, default: false },
    conflictMagnitude: { type: Number, default: null },
    perModalityScores: { type: mongoose.Schema.Types.Mixed, default: {} },
    explanation: { type: String },

    // Independent text-pattern safety net (same service community posts use)
    // kept separate from the ML model's own decision, so a crisis phrase
    // still surfaces resources even if the model itself scores it low risk.
    crisisTextFlag: { type: Boolean, default: false },
    crisisTextSeverity: { type: String, enum: ['imminent', 'elevated', null], default: null },

    needsClinicianReview: { type: Boolean, default: false, index: true },
    reviewed: { type: Boolean, default: false },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', select: false },
    reviewedAt: { type: Date, select: false },
    reviewNote: { type: String, select: false, maxlength: 2000 },
  },
  { timestamps: true }
);

screeningResultSchema.methods.toSummaryJSON = function toSummaryJSON() {
  return {
    id: this._id,
    riskScore: this.riskScore,
    decision: this.decision,
    modalitiesUsed: this.modalitiesUsed,
    crossModalConflict: this.crossModalConflict,
    conflictMagnitude: this.conflictMagnitude,
    perModalityScores: this.perModalityScores,
    explanation: this.explanation,
    crisisTextFlag: this.crisisTextFlag,
    crisisTextSeverity: this.crisisTextSeverity,
    needsClinicianReview: this.needsClinicianReview,
    reviewed: this.reviewed,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('ScreeningResult', screeningResultSchema);
