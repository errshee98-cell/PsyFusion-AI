const { validationResult } = require('express-validator');

/**
 * Run after express-validator checks on a route. Returns 400 with a clean
 * error list if validation failed, otherwise calls next().
 */
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  return next();
}

module.exports = { handleValidation };
