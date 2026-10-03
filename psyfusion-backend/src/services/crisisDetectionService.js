/**
 * Lightweight keyword/pattern-based crisis detection.
 *
 * This is a SAFETY-NET STUB, not a clinical classifier. It exists so posting
 * never ships without *some* detection layer. The AI/ML team should replace
 * `scanText` with a proper model (e.g. a fine-tuned classifier trained on
 * labeled crisis-language data, or a hosted moderation API) while keeping
 * the same return shape so callers don't need to change.
 *
 * Design choices:
 * - Biased toward false positives over false negatives: better to route a
 *   borderline post to human review than to miss a real crisis signal.
 * - Severity tiers let the moderation queue triage ('imminent' vs 'general
 *   distress') rather than treating every flag identically.
 * - Matched terms are stored for the moderation queue, never shown to other
 *   community members.
 */

const SEVERITY = {
  IMMINENT: 'imminent', // suggests active, near-term self-harm/suicide intent
  ELEVATED: 'elevated', // general crisis/self-harm language, intent unclear
};

// Non-exhaustive. Intentionally conservative patterns - tune with real data
// and a precision/recall eval before relying on this in production.
const IMMINENT_PATTERNS = [
  /\bkill(ing)? myself\b/i,
  /\bend(ing)? my life\b/i,
  /\bsuicide plan\b/i,
  /\bgoing to (die|kill myself)\b/i,
  /\bi('?m| am) going to (do it|end it)\b/i,
  /\bwant to die tonight\b/i,
];

const ELEVATED_PATTERNS = [
  /\bsuicidal\b/i,
  /\bwant(ed)? to die\b/i,
  /\bself[- ]?harm\b/i,
  /\bhurt(ing)? myself\b/i,
  /\bno reason to live\b/i,
  /\bcan'?t go on\b/i,
  /\bbetter off dead\b/i,
];

function scanText(text = '') {
  const matched = [];
  let severity = null;

  for (const pattern of IMMINENT_PATTERNS) {
    if (pattern.test(text)) {
      matched.push(pattern.source);
      severity = SEVERITY.IMMINENT;
    }
  }

  if (!severity) {
    for (const pattern of ELEVATED_PATTERNS) {
      if (pattern.test(text)) {
        matched.push(pattern.source);
        severity = SEVERITY.ELEVATED;
      }
    }
  }

  return {
    flagged: Boolean(severity),
    severity, // null | 'elevated' | 'imminent'
    matchedPatternCount: matched.length,
  };
}

// Shown to the poster immediately when flagged=true, regardless of which
// country they're in - keep this generic; a locale-aware resource lookup
// (e.g. by user-provided country) is a good follow-up task.
const CRISIS_RESOURCES_MESSAGE = {
  message:
    "It looks like you might be going through something very difficult. You're not alone, and support is available right now.",
  resources: [
    { name: '988 Suicide & Crisis Lifeline (US)', contact: 'Call or text 988' },
    { name: 'Crisis Text Line', contact: 'Text HOME to 741741 (US/Canada)' },
    { name: 'International Association for Suicide Prevention', contact: 'https://www.iasp.info/resources/Crisis_Centres/' },
  ],
  note: 'Your post has been placed in a private review queue and is not publicly visible yet.',
};

module.exports = { scanText, SEVERITY, CRISIS_RESOURCES_MESSAGE };
