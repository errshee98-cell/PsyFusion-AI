const ScreeningResult = require('../models/ScreeningResult');
const { requestPrediction, MlServiceError } = require('../services/mlServiceClient');
const { scanText, CRISIS_RESOURCES_MESSAGE } = require('../services/crisisDetectionService');
const logger = require('../utils/logger');

const PAGE_SIZE = 20;

/**
 * POST /api/screening
 * Accepts text (required) and optional audio/video uploads (multer, see
 * routes/screeningRoutes.js), runs the independent text-pattern crisis
 * check, calls the ML inference service, persists the result, and returns
 * both to the caller. Crisis resources are included whenever EITHER signal
 * fires - the text scanner or the model's own "abstain" / elevated-risk
 * decision - since either one can be the only thing that catches a real
 * case.
 */
async function submitScreening(req, res, next) {
  try {
    const text = (req.body.text || '').trim();
    const audioFile = req.files && req.files.audio && req.files.audio[0];
    const videoFile = req.files && req.files.video && req.files.video[0];

    const textScan = scanText(text);

    let prediction;
    try {
      prediction = await requestPrediction({
        text,
        audioBuffer: audioFile ? audioFile.buffer : undefined,
        audioFilename: audioFile ? audioFile.originalname : undefined,
        videoBuffer: videoFile ? videoFile.buffer : undefined,
        videoFilename: videoFile ? videoFile.originalname : undefined,
      });
    } catch (err) {
      if (err instanceof MlServiceError) {
        logger.error(`Screening ML call failed for user ${req.user.id}: ${err.message}`);
        // The ML layer being down must never silently drop a crisis signal -
        // if the text scan itself flagged this submission, still return
        // resources even though we have no model score to offer.
        if (textScan.flagged) {
          return res.status(503).json({
            error: 'ml_service_unavailable',
            message: 'Screening could not be fully processed right now, but your message was flagged for support.',
            crisisFlag: true,
            resources: CRISIS_RESOURCES_MESSAGE,
          });
        }
        return res.status(err.status).json({
          error: 'ml_service_unavailable',
          message: 'Screening could not be processed right now. Please try again shortly.',
        });
      }
      throw err;
    }

    const needsClinicianReview =
      textScan.severity === 'imminent' ||
      prediction.decision === 'abstain_review_needed' ||
      (prediction.decision === 'elevated_risk' && textScan.flagged);

    const record = await ScreeningResult.create({
      user: req.user.id,
      textSnapshot: text,
      hadAudio: Boolean(audioFile),
      hadVideo: Boolean(videoFile),
      riskScore: prediction.risk_score,
      decision: prediction.decision,
      modalitiesUsed: prediction.modalities_used,
      crossModalConflict: prediction.cross_modal_conflict,
      conflictMagnitude: prediction.conflict_magnitude,
      perModalityScores: prediction.per_modality_scores,
      explanation: prediction.explanation,
      crisisTextFlag: textScan.flagged,
      crisisTextSeverity: textScan.severity,
      needsClinicianReview,
    });

    if (textScan.severity === 'imminent') {
      logger.audit('screening.imminent_flag', { userId: req.user.id, screeningId: record._id.toString() });
    }

    const showResources = textScan.flagged || prediction.decision !== 'low_risk';

    return res.status(201).json({
      result: record.toSummaryJSON(),
      ...(showResources ? { resources: CRISIS_RESOURCES_MESSAGE } : {}),
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/screening/history
 * The current user's own past screenings, newest first. Never includes
 * `textSnapshot` - the summary view is score/decision/metadata only.
 */
async function listOwnHistory(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const results = await ScreeningResult.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE);

    return res.json({ results: results.map((r) => r.toSummaryJSON()), page });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/screening/flagged (clinician/admin only)
 * Screenings awaiting clinician attention, oldest-unresolved first so the
 * queue drains in order.
 */
async function listFlagged(req, res, next) {
  try {
    const results = await ScreeningResult.find({ needsClinicianReview: true, reviewed: false })
      .sort({ createdAt: 1 })
      .select('+textSnapshot')
      .populate('user', 'anonymousHandle');

    return res.json({
      results: results.map((r) => ({
        ...r.toSummaryJSON(),
        textSnapshot: r.textSnapshot,
        anonymousHandle: r.user ? r.user.anonymousHandle : null,
      })),
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /api/screening/flagged/:id (clinician/admin only)
 * Body: { note?: string }. Marks a flagged screening as reviewed - this is
 * an acknowledgement, not a moderation decision (there's no content to
 * approve/remove here, unlike community posts).
 */
async function markReviewed(req, res, next) {
  try {
    const record = await ScreeningResult.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'not_found' });
    }

    record.reviewed = true;
    record.reviewedBy = req.user.id;
    record.reviewedAt = new Date();
    if (req.body.note) record.reviewNote = req.body.note;
    await record.save();

    logger.audit('screening.reviewed', { screeningId: record._id.toString(), reviewerId: req.user.id });

    return res.json({ id: record._id, reviewed: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = { submitScreening, listOwnHistory, listFlagged, markReviewed };
