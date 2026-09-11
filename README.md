# LLD Practice Platform

A focused MVP for practicing Low-Level Design problems, submitting solutions, and receiving structured AI feedback — powered by the **Google Gemini API**.

---

## Quick Start

```bash
# 1. Clone / unzip the project
cd lld-practice-platform

# 2. Install dependencies
npm install

# 3. Add your Gemini API key to the .env file
echo "GEMINI_API_KEY=your-key-here" > .env

# 4. Start the server
node src/server.js

# 5. Open the app
open http://localhost:3000

# 6. Run tests
node tests/run-tests.js
```

**Node.js ≥ 18 required.**

---

## Environment Setup

Create a `.env` file in the project root (already gitignored):

```env
GEMINI_API_KEY=your-gemini-api-key-here
PORT=3000
```

Get a free Gemini API key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).

> ⚠️ Never commit your `.env` file. It is listed in `.gitignore` by default.

---

## What It Does

| Step | Experience |
|------|-----------|
| Browse | Pick from 5 LLD problems (Parking Lot, Elevator, Rate Limiter, Vending Machine, File System) |
| Design | Write a text design, code, or both in the editor |
| Submit | Click Submit; the server stores your attempt immediately |
| Evaluate | Gemini AI reviews your solution against a structured 6–7 criterion rubric |
| Review | See per-criterion scores, evidence, concerns, and concrete suggestions |
| Retry | Revise and resubmit; history tracks improvement over time |

---

## Project Structure

```
lld-practice-platform/
├── src/
│   ├── api/
│   │   └── server.js           # HTTP server (Node built-in, no Express)
│   ├── domain/
│   │   ├── models.js           # Problem, Attempt, Submission, Evaluation, Rubric (pure domain)
│   │   ├── repositories.js     # In-memory stores (swap for DB by reimplementing the interface)
│   │   └── practice-service.js # Orchestrates the full practice loop
│   ├── evaluator/
│   │   └── evaluator.js        # DeterministicEvaluator, GeminiEvaluator, HybridEvaluator, Factory
│   ├── problems/
│   │   └── problem-data.js     # 5 seeded LLD problems with full rubrics
│   └── server.js               # Entry point
├── public/
│   └── index.html              # Full dark-theme SPA (no framework, no build step)
├── tests/
│   └── run-tests.js            # 40 tests, no testing framework dependency
├── docs/
│   ├── RESEARCH.md
│   └── DESIGN.md
├── .env                        # API keys — DO NOT COMMIT
├── .gitignore
├── AI_USAGE.md
├── package.json
├── package-lock.json
└── README.md
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/problems` | List all problems (filter: `?difficulty=easy`) |
| GET | `/api/problems/:id` | Full problem with rubric |
| POST | `/api/attempts` | Start or resume an attempt `{ userId, problemId }` |
| GET | `/api/attempts/:id` | Get attempt with submissions |
| POST | `/api/attempts/:id/submit` | Submit a solution `{ format, content }` |
| GET | `/api/attempts/:id/submissions/:subId` | Poll submission status + evaluation |
| GET | `/api/users/:userId/history` | Attempt history with scores |
| GET | `/health` | Health check |

---

## AI Evaluation — Gemini

Evaluation uses the **`@google/generative-ai` SDK** with the `gemini-1.5-flash` model.

Each submission is evaluated against a fixed rubric. The prompt instructs Gemini to return a structured JSON array — one object per criterion — in this shape:

```json
{
  "criterionId": "class-resp",
  "score": 8,
  "evidence": "Candidate defines separate ParkingLot, Floor, and Spot classes with clear ownership.",
  "concern": "",
  "suggestion": "Consider extracting a TicketService to own payment logic.",
  "confidence": "high"
}
```

Deterministic checks (e.g. requirement coverage) run as fast rule-based logic before the Gemini call, so the AI only handles the judgment-heavy criteria.

---

## Key Design Decisions

### 1. Submit-before-evaluate
The submission is stored with status `SUBMITTED` before the Gemini call begins. If evaluation fails or times out, the submission is preserved as `FAILED` and can be retried. No work is lost.

### 2. Status machine
```
SUBMITTED → EVALUATING → COMPLETED
                       → FAILED
```
Invalid transitions throw immediately in the domain layer, not silently ignored.

### 3. Rubric-first evaluation
Each problem has a `Rubric` of weighted `RubricCriterion` objects fixed at problem definition time. This makes feedback consistent, comparable across retries, and explainable to the learner.

### 4. Deterministic + AI separation
Structural checks (requirement coverage) run synchronously with rules — no API call. Design-quality criteria (coupling, abstraction, extensibility) are sent to Gemini with the rubric embedded in the prompt.

### 5. Extensibility points
- **New submission format**: Add a value to `SubmissionFormat` and handle it in `PracticeService._validateSubmission`. Nothing else changes.
- **New evaluator** (human review, rule-based): Implement `evaluate(ctx)` and register it in `EvaluatorFactory.create`.
- **Persistence**: All three repositories use a simple in-memory interface. Swap for Postgres by reimplementing the same methods.

---

## Limitations (known, by design)

- In-memory storage — all data is lost on server restart.
- No authentication — user ID is a randomly generated string per session.
- No diagram submission support — text and code only for MVP.
- AI evaluation is async; the UI polls every 2 seconds for up to 2 minutes.
- No rate limiting on the evaluation endpoint.