const express = require('express');
const { body } = require('express-validator');
const { handleValidation } = require('../middleware/validate');
const { authLimiter } = require('../middleware/security');
const { authenticate } = require('../middleware/auth');
const authController = require('../controllers/authController');
const mfaController = require('../controllers/mfaController');

const router = express.Router();

const passwordRule = body('password')
  .isLength({ min: 12 })
  .withMessage('Password must be at least 12 characters')
  .matches(/[A-Z]/)
  .withMessage('Password must include an uppercase letter')
  .matches(/[a-z]/)
  .withMessage('Password must include a lowercase letter')
  .matches(/[0-9]/)
  .withMessage('Password must include a number')
  .matches(/[^A-Za-z0-9]/)
  .withMessage('Password must include a symbol');

router.post(
  '/register',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    passwordRule,
    body('displayName').optional().trim().isLength({ max: 60 }),
  ],
  handleValidation,
  authController.register
);

router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  handleValidation,
  authController.login
);

router.post('/refresh', authLimiter, authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

router.post(
  '/verify-email',
  authLimiter,
  [body('token').notEmpty().withMessage('token is required')],
  handleValidation,
  authController.verifyEmail
);

// --- MFA ---
router.post('/mfa/setup', authenticate, mfaController.setupMfa);
router.post(
  '/mfa/verify-setup',
  authenticate,
  [body('code').notEmpty().withMessage('code is required')],
  handleValidation,
  mfaController.verifySetup
);
router.post(
  '/mfa/verify-login',
  authLimiter,
  [body('mfaToken').notEmpty(), body('code').notEmpty()],
  handleValidation,
  mfaController.verifyLogin
);
router.post(
  '/mfa/disable',
  authenticate,
  [body('password').notEmpty().withMessage('password is required')],
  handleValidation,
  mfaController.disableMfa
);

module.exports = router;
