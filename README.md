# LLD Practice Platform

A focused MVP for practicing Low-Level Design problems, submitting solutions, and receiving structured AI feedback.

---

## Quick Start

```bash
# Clone / unzip the project, then:
cd lld-practice-platform

# Set your Anthropic API key (required for AI feedback)
export ANTHROPIC_API_KEY=sk-ant-...

# Run the server (no npm install needed — zero dependencies)
node src/server.js

# Open the app
open http://localhost:3000

# Run tests
node tests/run-tests.js
```

**Node.js ≥ 18 required.** No npm install step — the project has zero runtime dependencies.

---

## What It Does

| Step | Experience |
|------|-----------|
| Browse | Pick from 5 LLD problems (Parking Lot, Elevator, Rate Limiter, Vending Machine, File System) |
| Design | Write a text design, code, or both in the editor |
| Submit | Click Submit; the server stores your attempt immediately |
| Evaluate | AI reviews your solution against a structured 6–7 criterion rubric |
| Review | See per-criterion scores, evidence, concerns, and concrete suggestions |
| Retry | Revise and resubmit; history tracks improvement over time |

---

## Project Structure

```
lld-practice-platform/
├── src/
│   ├── domain/
│   │   ├── models.js           # Problem, Attempt, Submission, Evaluation, Rubric (pure domain)
│   │   ├── repositories.js     # In-memory stores (swap for DB by reimplementing the interface)
│   │   └── practice-service.js # Orchestrates the full practice loop
│   ├── evaluator/
│   │   └── evaluator.js        # DeterministicEvaluator, AIEvaluator, HybridEvaluator, Factory
│   ├── problems/
│   │   └── problem-data.js     # 5 seeded LLD problems with full rubrics
│   ├── api/
│   │   └── server.js           # HTTP server (Node built-in, no Express)
│   └── server.js               # Entry point
├── public/
│   └── index.html              # Full dark-theme SPA (no framework, no build step)
├── tests/
│   └── run-tests.js            # 40 tests, no testing framework dependency
├── docs/
│   ├── RESEARCH.md
│   └── DESIGN.md
├── AI_USAGE.md
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

## Key Design Decisions

### 1. Submit-before-evaluate
The submission is stored with status `SUBMITTED` before evaluation begins. If evaluation fails, the submission is preserved as `FAILED` and can be retried. No work is lost on evaluator timeout.

### 2. Status machine
`SUBMITTED → EVALUATING → COMPLETED | FAILED`  
Invalid transitions throw immediately in the domain layer (not silently ignored).

### 3. Rubric-first evaluation
Each problem has a `Rubric` of weighted `RubricCriterion` objects. The rubric is fixed at problem definition time, not generated at evaluation time. This makes feedback consistent and explainable.

### 4. Deterministic + AI separation
Structural checks (requirement coverage) run synchronously with rules. Design-quality criteria (coupling, abstraction, extensibility) are sent to the AI with the rubric embedded in the prompt. The `EvaluatorFactory` creates the right evaluator.

### 5. Extensibility points
- **New submission format**: Add a format value to `SubmissionFormat` and handle it in `PracticeService._validateSubmission`. No other changes needed.
- **New evaluator** (human review, rule-based): Implement `evaluate(ctx)` and register in `EvaluatorFactory.create`.
- **Persistence**: `ProblemRepository`, `AttemptRepository`, `EvaluationRepository` implement a simple in-memory interface. Swap for Postgres by reimplementing the same methods.

---

## Limitations (known, by design)

- No authentication — user ID is a randomly generated string per session.
- In-memory storage — all data is lost on server restart.
- No diagram submission support — text and code only for MVP.
- AI evaluation is async; the UI polls every 2 seconds for up to 2 minutes.
- No rate limiting on the evaluation endpoint.
