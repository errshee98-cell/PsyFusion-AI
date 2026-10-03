/**
 * Minimal email-sending abstraction for verification emails.
 *
 * No real SMTP/transactional-email provider (nodemailer, SendGrid, SES, etc.)
 * is wired up here - none of those packages could be installed in the
 * sandbox this was built in (no npm registry access, see the backend
 * README). Rather than leave email verification entirely unbuilt, this
 * implements the same interface a real provider would (`sendMail`) with a
 * console/log "transport" that a team can swap out for a real one without
 * touching any caller - every call site below imports `sendMail` from this
 * module, not a specific provider SDK.
 *
 * To wire up a real provider later: replace the body of `sendMail` with
 * e.g. `nodemailer.createTransport(...).sendMail(...)` or an SES/SendGrid
 * API call, keeping the same (to, subject, html, text) signature.
 */

const logger = require('../utils/logger');

async function sendMail({ to, subject, html, text }) {
  // Logged at info level (not audit) since this is operational, not a
  // security-relevant event by itself - the caller logs the audit event
  // (e.g. 'verification_email_sent') with the user id, not the email body.
  logger.info(`[emailService] (no real transport configured) Would send email to ${to}: "${subject}"`);
  if (process.env.NODE_ENV !== 'production') {
    // In dev/test, print the body so a developer can act on the link/code
    // without needing a real inbox.
    logger.info(`[emailService] body:\n${text || html}`);
  }
  return { delivered: false, reason: 'no_transport_configured' };
}

function buildVerificationEmail({ email, verifyUrl }) {
  return {
    to: email,
    subject: 'Verify your PsyFusion AI account',
    text: `Welcome to PsyFusion AI. Verify your email by visiting:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
    html: `<p>Welcome to PsyFusion AI.</p><p><a href="${verifyUrl}">Verify your email</a> (expires in 24 hours).</p>`,
  };
}

module.exports = { sendMail, buildVerificationEmail };
