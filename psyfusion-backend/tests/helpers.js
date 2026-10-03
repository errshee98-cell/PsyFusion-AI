const User = require('../src/models/User');
const { signAccessToken } = require('../src/services/tokenService');

const VALID_PASSWORD = 'Str0ng!Passw0rd#2026';

/**
 * Creates a user directly via the model (bypassing the register endpoint,
 * which always assigns role 'user' by design - tests that need a clinician
 * or admin set the role here instead).
 */
async function createUser({ email, password = VALID_PASSWORD, role = 'user' } = {}) {
  const user = new User({
    email: email || `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    role,
  });
  await user.setPassword(password);
  await user.save();
  return { user, password };
}

/** Signs an access token directly for a given user, skipping the login flow
 * (useful for RBAC tests that don't care about the login mechanics). */
function tokenFor(user) {
  return signAccessToken(user);
}

function authHeader(user) {
  return { Authorization: `Bearer ${tokenFor(user)}` };
}

module.exports = { VALID_PASSWORD, createUser, tokenFor, authHeader };
