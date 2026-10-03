const express = require('express');
const multer = require('multer');
const { body, param } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const { screeningLimiter } = require('../middleware/security');
const { handleValidation } = require('../middleware/validate');
const {
  submitScreening,
  listOwnHistory,
  listFlagged,
  markReviewed,
} = require('../controllers/screeningController');

const router = express.Router();

// Files are held in memory just long enough to forward to the ML service
// (see mlServiceClient.requestPrediction) - never written to disk here.
// 20MB/file matches the ML service's own MAX_CONTENT_LENGTH headroom.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 2 },
  fileFilter(req, file, cb) {
    const allowed = {
      audio: ['audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/flac', 'audio/x-wav'],
      video: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'],
    };
    if (!allowed[file.fieldname] || !allowed[file.fieldname].includes(file.mimetype)) {
      return cb(new Error(`Unsupported file type for field "${file.fieldname}": ${file.mimetype}`));
    }
    return cb(null, true);
  },
});

router.post(
  '/',
  authenticate,
  screeningLimiter,
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'video', maxCount: 1 },
  ]),
  [
    body('text')
      .trim()
      .isLength({ min: 1, max: 4000 })
      .withMessage('text is required and must be 4000 characters or fewer'),
  ],
  handleValidation,
  submitScreening
);

router.get('/history', authenticate, listOwnHistory);

router.get('/flagged', authenticate, authorize('clinician', 'admin'), listFlagged);

router.patch(
  '/flagged/:id',
  authenticate,
  authorize('clinician', 'admin'),
  [param('id').isMongoId(), body('note').optional().isString().isLength({ max: 2000 })],
  handleValidation,
  markReviewed
);

module.exports = router;
