const { scanText, SEVERITY, CRISIS_RESOURCES_MESSAGE } = require('../src/services/crisisDetectionService');

// Every phrase below was run against the real implementation before being
// written here as an expectation (not guessed) - see the PR/commit this
// file shipped with for that verification run.

describe('scanText - imminent severity', () => {
  it.each([
    'i want to kill myself',
    'killing myself tonight',
    'i am ending my life',
    'i have a suicide plan',
    'i am going to kill myself',
    "i'm going to do it tonight",
    'i want to die tonight',
  ])('flags "%s" as imminent', (text) => {
    const result = scanText(text);
    expect(result.flagged).toBe(true);
    expect(result.severity).toBe(SEVERITY.IMMINENT);
  });
});

describe('scanText - elevated severity', () => {
  it.each([
    'i feel suicidal',
    'i wanted to die yesterday',
    'thinking about self-harm',
    'thinking about self harm',
    'hurting myself feels like the only option',
    'no reason to live',
    'i cant go on',
    "i can't go on like this",
    'everyone would be better off dead',
  ])('flags "%s" as elevated', (text) => {
    const result = scanText(text);
    expect(result.flagged).toBe(true);
    expect(result.severity).toBe(SEVERITY.ELEVATED);
  });
});

describe('scanText - not flagged', () => {
  it.each([
    'had a great workout today',
    'this homework is killing me', // figurative "killing" - known limitation, see below
    '',
  ])('does not flag "%s"', (text) => {
    const result = scanText(text);
    expect(result.flagged).toBe(false);
    expect(result.severity).toBeNull();
  });

  it('documents the figurative-language false-negative as a known limitation, not a regression', () => {
    // "killing me" (figurative, e.g. about a deadline) does not match
    // "killing myself" and is correctly NOT flagged. This test exists so
    // that if a future pattern change starts flagging this phrase, it's a
    // deliberate choice, not an accident - precision/recall tuning on real
    // data should drive that change, not a one-off regex tweak.
    const result = scanText('this traffic is killing me');
    expect(result.flagged).toBe(false);
  });
});

describe('scanText - severity priority', () => {
  it('reports imminent when both imminent and elevated patterns are present', () => {
    // "kill myself" (imminent) and "suicidal" (elevated) both appear -
    // the more severe classification must win so moderation triage sees it first.
    const result = scanText('i feel suicidal and i want to kill myself');
    expect(result.severity).toBe(SEVERITY.IMMINENT);
  });
});

describe('CRISIS_RESOURCES_MESSAGE', () => {
  it('includes at least one crisis resource with a name and contact method', () => {
    expect(CRISIS_RESOURCES_MESSAGE.resources.length).toBeGreaterThan(0);
    for (const resource of CRISIS_RESOURCES_MESSAGE.resources) {
      expect(resource.name).toEqual(expect.any(String));
      expect(resource.contact).toEqual(expect.any(String));
    }
  });
});
