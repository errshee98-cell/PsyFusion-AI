/**
 * Thin client for the Python ML inference service (psyfusion-ml/service).
 *
 * Uses Node's built-in fetch/FormData/Blob (Node 18+, no extra dependency)
 * to call POST /predict. The service is internal-only - this client sends
 * the shared-secret header the service requires and never forwards it
 * anywhere else.
 */

const env = require('../config/env');
const logger = require('../utils/logger');

class MlServiceError extends Error {
  constructor(message, { status = 502, cause } = {}) {
    super(message);
    this.name = 'MlServiceError';
    this.status = status; // HTTP status the API layer should respond with
    this.cause = cause;
  }
}

/**
 * @param {Object} params
 * @param {string} params.text - required screening text
 * @param {Buffer} [params.audioBuffer] - optional raw audio file bytes
 * @param {string} [params.audioFilename]
 * @param {Buffer} [params.videoBuffer] - optional raw video file bytes
 * @param {string} [params.videoFilename]
 * @returns {Promise<Object>} the ML service's prediction result
 */
async function requestPrediction({ text, audioBuffer, audioFilename, videoBuffer, videoFilename }) {
  if (!env.ML_SERVICE_API_KEY) {
    // Fail loudly in a way the controller can turn into a clean 503 - a
    // misconfigured deployment should not silently skip screening.
    throw new MlServiceError('ML_SERVICE_API_KEY is not configured on the backend.', { status: 503 });
  }

  const hasFiles = Boolean(audioBuffer || videoBuffer);
  let body;
  let extraHeaders = {};

  if (hasFiles) {
    const form = new FormData();
    form.append('text', text);
    if (audioBuffer) {
      form.append('audio', new Blob([audioBuffer]), audioFilename || 'audio.wav');
    }
    if (videoBuffer) {
      form.append('video', new Blob([videoBuffer]), videoFilename || 'video.mp4');
    }
    body = form; // fetch sets the multipart Content-Type/boundary itself
  } else {
    body = JSON.stringify({ text });
    extraHeaders = { 'Content-Type': 'application/json' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.ML_SERVICE_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${env.ML_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: {
        'X-Internal-Api-Key': env.ML_SERVICE_API_KEY,
        ...extraHeaders,
      },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new MlServiceError('ML service timed out.', { status: 504, cause: err });
    }
    logger.error(`ML service request failed: ${err.message}`);
    throw new MlServiceError('ML service is unreachable.', { status: 503, cause: err });
  } finally {
    clearTimeout(timeout);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (err) {
    // fall through with payload=null; handled below
  }

  if (!response.ok) {
    const message = (payload && payload.message) || `ML service returned ${response.status}`;
    throw new MlServiceError(message, { status: response.status === 401 || response.status === 503 ? 503 : 502 });
  }

  if (!payload) {
    throw new MlServiceError('ML service returned an unparseable response.', { status: 502 });
  }

  return payload;
}

async function checkHealth() {
  try {
    const response = await fetch(`${env.ML_SERVICE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    const payload = await response.json().catch(() => null);
    return { reachable: response.ok, ...payload };
  } catch (err) {
    return { reachable: false, error: err.message };
  }
}

module.exports = { requestPrediction, checkHealth, MlServiceError };
