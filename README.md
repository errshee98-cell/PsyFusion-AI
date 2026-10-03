# PsyFusion AI

## Multimodal Mental Health Screening and Risk Assessment Platform

PsyFusion AI is a research oriented AI-assisted platform designed to combine multiple complementary sources of mental-health information to support screening, risk assessment, longitudinal monitoring, and professional review.

we are conducting a survey to work on the project in a better way and improvise it according to the end user and practitioners requirement rather than just Building some slop.so kindly fill out this form : https://link.jotform.com/Y5TbokfZDJ


The platform explores the integration of:

• Validated mental health questionnaires
• Speech and audio characteristics
• Text and language features
• Cognitive task performance
• Longitudinal behavioral information

The system is designed to investigate whether multimodal and longitudinal AI can provide more robust, calibrated, and generalizable screening support than conventional single-modality approaches.

---

## Key Research Features

### Multimodal AI
Combines information from multiple complementary modalities rather than relying on a single data source.

### Longitudinal Monitoring
Tracks changes over time and can compare current observations with an individual's previous baseline.

### Missing-Modality Robustness
Designed to operate when one or more data modalities are unavailable.

### Cross-Modal Consistency
Identifies disagreement between different sources of information rather than blindly combining their outputs.

### Uncertainty Estimation
The system can indicate when evidence is insufficient or uncertain instead of always producing a confident prediction.

### Calibration
Model confidence is evaluated and calibrated rather than relying solely on raw prediction scores.

### Explainability
Provides information about the evidence and modalities contributing to a screening result.

### Fairness & Generalizability
Performance is evaluated across relevant populations and, where possible, across independent datasets or sites.

### Clinician-in-the-Loop
AI outputs are intended to support professional review rather than replace qualified healthcare professionals.

---

## Initial Screening Domains

The initial research implementation may focus on:

- Depression,Post Partum Depression
- Anxiety
- ADHD-related screening
- Autism-related screening

Additional screening modules may be added in future versions.

---

## System Architecture

```text
Patient
   │
   ▼
Consent & Privacy
   │
   ▼
Initial Screening
   │
   ├── Questionnaires
   ├── Speech
   ├── Text
   ├── Cognitive Tasks
   └── Longitudinal Data
          │
          ▼
     Data Quality
          │
          ▼
   Modality Encoders
          │
          ▼
   Multimodal Fusion
          │
          ├── Missing-Modality Engine
          ├── Consistency Engine
          └── Uncertainty Engine
          │
          ▼
      Calibration
          │
          ▼
   Screening Assessment
          │
          ▼
   Evidence & Explanation
          │
          ▼
   Clinician Review
          │
          ▼
   Referral / Follow-up
```
---

## Repository Structure

```text
psyfusion-ai/
├── psyfusion-backend/    Node.js + Express + MongoDB API (auth, MFA, RBAC, screening, community)
├── psyfusion-ml/         Python ML pipeline (text + audio + face) and internal inference service
└── psyfusion-frontend/   React + TypeScript + Vite web app
```

| Component | Stack | Default port | Details |
|-----------|-------|--------------|---------|
| Frontend | React 18, TypeScript, Vite | `5173` | [psyfusion-frontend/README.md](psyfusion-frontend/README.md) |
| Backend | Node.js 18+, Express, MongoDB, JWT, TOTP MFA | `5000` | [psyfusion-backend/README.md](psyfusion-backend/README.md) |
| ML service | Python, scikit-learn, OpenCV, Flask | `8000` (internal only) | [psyfusion-ml/README.md](psyfusion-ml/README.md) |

Request flow: **Frontend → Backend API → ML inference service**. The ML service is never called directly by the browser; the backend authenticates users, validates input, runs crisis detection and then forwards screening requests using a shared internal API key.

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- MongoDB (local or hosted)

### 1. ML service

```bash
cd psyfusion-ml
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m src.train --synthetic    # creates model files in artifacts/ (not committed)
export ML_SERVICE_API_KEY="<shared secret>"
python -m service.app              # runs on :8000
```

### 2. Backend

```bash
cd psyfusion-backend
cp .env.example .env               # then fill in real values
npm install
npm run dev                        # runs on :5000
npm test                           # run the test suite
```

In `.env`, generate each secret separately:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Set `ML_SERVICE_API_KEY` to the same value used for the ML service, and set `CORS_ORIGINS=http://localhost:5173` so the frontend can reach the API.

### 3. Frontend

```bash
cd psyfusion-frontend
cp .env.example .env.local         # VITE_API_BASE_URL=http://localhost:5000
npm install
npm run dev                        # runs on :5173
```

---

## Security & Secrets

- **Never commit real `.env` files, API keys or credentials.** `.gitignore` files at the root and in each component block `.env`, `.env.*`, `*.pem`, `*.key` and credential JSON files.
- Only `.env.example` templates with placeholder values are tracked. Copy them locally and fill in your own values.
- Use different random values for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET` and `MFA_CHALLENGE_SECRET`.
- Keep the ML service on a private network or localhost. Do not expose port `8000` publicly.
- If a secret is ever committed by mistake, rotate it right away. Removing it from the repo does not remove it from git history.

---

## Project Status

This is an early research prototype. The ML models included for development are trained on **synthetic data** only, so their metrics prove the pipeline works and say nothing about real-world performance. Each component's README lists what has and has not been verified.

---

## Disclaimer

PsyFusion AI is a research tool and **not a medical device**. It does not provide a diagnosis and is not a substitute for professional care. If you or someone you know is in crisis, contact local emergency services or a crisis helpline right away.
