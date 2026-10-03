"""
PsyFusion ML inference service.

Wraps `src.inference.PsyFusionPredictor` behind an HTTP API so the Node
backend can call it as a plain internal service instead of shelling out to a
Python process per request.

Why Flask and not FastAPI
--------------------------
The original plan (see psyfusion-ml/requirements.txt) was FastAPI + uvicorn,
which is still the recommended choice for a real deployment (async, auto
OpenAPI docs, pydantic validation). In THIS sandboxed environment `fastapi`
is not installed and the package registry is blocked, so it could not be
installed or verified here (confirmed via `pip install fastapi` -> no
matching distribution). `uvicorn` happens to be preinstalled but is useless
without an ASGI app. `flask` IS preinstalled, so this service is built and
actually run/tested with Flask instead. The endpoint contract below
(`POST /predict`, `GET /health`) is framework-agnostic - swapping in FastAPI
later is a rewrite of this one file, not of anything that calls it.

Security model
---------------
This service is NOT meant to be exposed to the public internet. It should
run on an internal network/port that only the Node backend can reach (e.g.
bound to localhost, or a private network in Docker Compose/Kubernetes). As
defense in depth it also requires a shared-secret header
(`X-Internal-Api-Key`) matching `ML_SERVICE_API_KEY`, so a misconfigured
network boundary doesn't turn into an open inference endpoint. It does not
duplicate the Node backend's user-facing auth, rate limiting, or input
sanitization - the Node backend is responsible for all of that before a
request ever reaches here.

Run (development):
    cd psyfusion-ml
    pip install -r requirements.txt   # needs flask (see requirements.txt)
    export ML_SERVICE_API_KEY="<shared secret, same value the Node backend uses>"
    python -m service.app

Run (production):
    Put a real WSGI server in front (gunicorn/waitress), e.g.:
        gunicorn -w 2 -b 127.0.0.1:8000 service.app:app
    `gunicorn` is not installed in this sandbox either; this was not run
    with gunicorn here, only with Flask's built-in dev server, and only
    against synthetic-trained artifacts (see psyfusion-ml/README.md).
"""

import logging
import os
import tempfile
import time
import traceback
from pathlib import Path

from flask import Flask, jsonify, request

from src.inference import PsyFusionPredictor

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger('psyfusion.service')

MAX_TEXT_LENGTH = 4000
MAX_CONTENT_LENGTH = 25 * 1024 * 1024  # 25MB, generous enough for a short audio/video clip
ALLOWED_AUDIO_EXT = {'.wav', '.mp3', '.m4a', '.ogg', '.flac'}
ALLOWED_VIDEO_EXT = {'.mp4', '.mov', '.avi', '.webm'}

API_KEY = os.environ.get('ML_SERVICE_API_KEY')

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

_predictor = None
_predictor_error = None


def _load_predictor():
    """Load model artifacts once at process start. Kept lazy-but-cached so
    the service can still boot and answer /health usefully even if the
    artifacts directory is missing (e.g. before anyone has run training)."""
    global _predictor, _predictor_error
    try:
        _predictor = PsyFusionPredictor()
        logger.info('Model artifacts loaded: text=yes audio=%s face=%s',
                     'yes' if _predictor.audio_model else 'no',
                     'yes' if _predictor.face_model else 'no')
    except Exception as exc:  # noqa: BLE001 - we want to report any load failure, not crash
        _predictor_error = str(exc)
        logger.error('Failed to load model artifacts: %s', exc)


_load_predictor()


@app.before_request
def _check_api_key():
    # /health is intentionally exempt so an orchestrator can probe liveness
    # without a secret.
    if request.path == '/health':
        return None
    if not API_KEY:
        # Fail closed: an operator who forgot to set the secret should see
        # every request rejected, not an accidentally-open service.
        return jsonify(error='service_misconfigured',
                        message='ML_SERVICE_API_KEY is not set on the server.'), 503
    supplied = request.headers.get('X-Internal-Api-Key', '')
    if not _constant_time_eq(supplied, API_KEY):
        return jsonify(error='unauthorized'), 401
    return None


def _constant_time_eq(a: str, b: str) -> bool:
    import hmac
    return hmac.compare_digest(a.encode('utf-8'), b.encode('utf-8'))


@app.get('/health')
def health():
    return jsonify(
        status='ok' if _predictor is not None else 'degraded',
        artifacts_loaded=_predictor is not None,
        load_error=_predictor_error,
        modalities_available={
            'text': _predictor is not None,
            'audio': bool(_predictor and _predictor.audio_model is not None),
            'face': bool(_predictor and _predictor.face_model is not None),
        },
    ), (200 if _predictor is not None else 503)


def _save_upload(file_storage, allowed_ext, field_name):
    suffix = Path(file_storage.filename or '').suffix.lower()
    if suffix not in allowed_ext:
        raise ValueError(f'{field_name}: unsupported file extension "{suffix}"')
    fd, path = tempfile.mkstemp(suffix=suffix, prefix=f'psyfusion_{field_name}_')
    os.close(fd)
    file_storage.save(path)
    return path


@app.post('/predict')
def predict():
    if _predictor is None:
        return jsonify(error='model_not_loaded', message=_predictor_error), 503

    # Accept either JSON (text-only) or multipart/form-data (text + optional
    # audio/video files), since file uploads can't travel as plain JSON.
    if request.content_type and 'multipart/form-data' in request.content_type:
        text = (request.form.get('text') or '').strip()
    else:
        payload = request.get_json(silent=True) or {}
        text = (payload.get('text') or '').strip()

    if not text:
        return jsonify(error='invalid_request', message='"text" is required and cannot be empty.'), 400
    if len(text) > MAX_TEXT_LENGTH:
        return jsonify(error='invalid_request',
                        message=f'"text" exceeds the {MAX_TEXT_LENGTH} character limit.'), 400

    audio_path = None
    video_path = None
    temp_paths = []

    try:
        if request.files.get('audio'):
            try:
                audio_path = _save_upload(request.files['audio'], ALLOWED_AUDIO_EXT, 'audio')
                temp_paths.append(audio_path)
            except ValueError as exc:
                return jsonify(error='invalid_request', message=str(exc)), 400

        if request.files.get('video'):
            try:
                video_path = _save_upload(request.files['video'], ALLOWED_VIDEO_EXT, 'video')
                temp_paths.append(video_path)
            except ValueError as exc:
                return jsonify(error='invalid_request', message=str(exc)), 400

        start = time.monotonic()
        try:
            result = _predictor.predict(text, audio_path=audio_path, video_path=video_path)
        except Exception:  # noqa: BLE001
            logger.error('Prediction failed:\n%s', traceback.format_exc())
            return jsonify(error='prediction_failed',
                            message='The model could not process this request.'), 500
        elapsed_ms = round((time.monotonic() - start) * 1000, 1)

        result['latency_ms'] = elapsed_ms
        return jsonify(result), 200

    finally:
        for path in temp_paths:
            try:
                os.remove(path)
            except OSError:
                pass


@app.errorhandler(413)
def too_large(_err):
    return jsonify(error='payload_too_large',
                    message=f'Request exceeds the {MAX_CONTENT_LENGTH} byte limit.'), 413


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    # Dev server only - see module docstring for production guidance.
    app.run(host='127.0.0.1', port=port, debug=False)
