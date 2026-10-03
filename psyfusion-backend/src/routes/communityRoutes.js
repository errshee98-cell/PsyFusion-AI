const express = require('express');
const { body, param } = require('express-validator');
const { handleValidation } = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { postLimiter } = require('../middleware/security');
const communityController = require('../controllers/communityController');

const router = express.Router();

router.get('/posts', authenticate, communityController.listPosts);

router.post(
  '/posts',
  authenticate,
  postLimiter,
  [body('body').trim().isLength({ min: 1, max: 2000 }).withMessage('Post must be 1-2000 characters')],
  handleValidation,
  communityController.createPost
);

// Moderation queue - clinician/admin only
router.get(
  '/moderation/queue',
  authenticate,
  authorize('clinician', 'admin'),
  communityController.listReviewQueue
);

router.patch(
  '/moderation/:postId',
  authenticate,
  authorize('clinician', 'admin'),
  [
    param('postId').isMongoId(),
    body('decision').isIn(['approve', 'remove']),
    body('note').optional().trim().isLength({ max: 500 }),
  ],
  handleValidation,
  communityController.reviewPost
);

module.exports = router;
