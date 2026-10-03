const { verifyAccessToken } = require('../services/tokenService');
const User = require('../models/User');

/**
 * Verifies the access token from the Authorization header and attaches
 * req.user (minimal, from the token - not a DB hit on every request).
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed authorization header' });
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
}

/**
 * Role-based access control. Usage: authorize('clinician', 'admin')
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    return next();
  };
}

/**
 * Loads the full user document onto req.fullUser when a route needs more
 * than id/role (e.g. profile endpoints). Use sparingly - most routes only
 * need authenticate().
 */
async function loadFullUser(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }
    req.fullUser = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { authenticate, authorize, loadFullUser };
