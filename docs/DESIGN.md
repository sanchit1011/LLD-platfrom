# Design Note: LLD Practice Platform MVP

---

## 1. MVP Scope

**5 problems, 1 submission format (text + code), 1 evaluation flow, attempt history.**

The practice loop is:

```
Problem list → Start attempt → Write design/code → Submit
  → AI evaluates against rubric → View per-criterion feedback
  → Revise and resubmit → Score improves
```

---

## 2. User Flow

```
/                       Home — explains what the platform does
/problems               Browse 5 problems with difficulty filter
/problem/:id            Problem statement, requirements, rubric preview, editor
  [Submit]              POST /api/attempts/:id/submit
                         → Server: SUBMITTED → async evaluation → COMPLETED
  [Poll /status]         Frontend polls every 2s
  [Feedback panel]       Per-criterion accordion: score / evidence / concern / suggestion
  [Retry]               Edit and submit again; new submission on same attempt
/history                All attempts for this user with latest scores
```

---

## 3. Core Domain Model

```
Problem
  id, title, difficulty, category
  statement, requirements[], constraints[], hints[]
  rubric: Rubric
    criteria: RubricCriterion[]
      id, name, description, weight (0–1), deterministic (bool)

Attempt
  id, userId, problemId
  submissions: Submission[]   ← ordered history; one Attempt per user per problem
  startedAt, lastActiveAt

Submission
  id, attemptId, problemId
  format: "text" | "code" | "combined"
  content: { design?: string, code?: string }
  status: SUBMITTED | EVALUATING | COMPLETED | FAILED
  submittedAt

Evaluation
  id, submissionId, problemId
  results: CriterionResult[]
    criterionId, score (0–10), evidence, concern, suggestion, confidence
  overallScore (0–100, weighted sum), summary, evaluatorType

CriterionResult (per rubric criterion)
  criterionId → score → evidence → concern → suggestion → confidence
```

**Key invariants enforced in the domain layer:**
- Rubric weights must sum to 1.0 (validated in Rubric constructor)
- Submission status transitions are validated; invalid transitions throw immediately
- Attempt.addSubmission is immutable (returns a new Attempt)
- One Attempt per user per problem (idempotent startAttempt)

---

## 4. Evaluation Approach

### Why a rubric?
Unconstrained questions ("Is this a good design?") produce inconsistent AI output and make improvement invisible. A rubric:
- Makes the evaluation criteria known to the learner upfront
- Gives the AI a structured output shape to fill
- Makes scores comparable across retries
- Separates "what was checked" from "how it was checked"

### Hybrid evaluation pipeline

```
Submission
  │
  ├── DeterministicEvaluator
  │     Runs for criteria where deterministic=true
  │     Current: req-coverage (keyword heuristic against requirements list)
  │     Fast, sync, no API call
  │
  └── AIEvaluator
        Runs for all non-deterministic criteria
        Sends rubric + submission to claude-sonnet-4-6
        Prompt: fixed rubric → required JSON output shape
        Returns CriterionResult[] parsed from JSON
```

**AI prompt design:**
- The rubric criteria are listed explicitly in the prompt
- The required output shape is specified (`criterionId, score, evidence, concern, suggestion, confidence`)
- The AI is told to cite evidence from the submission, not give generic advice
- Score meanings are defined: 8–10 = well-met, 5–7 = partial, 0–4 = missing
- The AI is told not to penalise a valid alternative design

### Change test B (evaluator swap)
Adding a `RuleBasedEvaluator` or `HumanReviewEvaluator`:
1. Implement `evaluate(ctx)` returning `CriterionResult[]`
2. Register in `EvaluatorFactory.create`
3. `PracticeService` is unchanged

---

## 5. Async Evaluation & Status Flow

```
POST /submit
  → Submission saved as SUBMITTED (never lost)
  → evaluateAsync() fires (not awaited)
  → HTTP 202 returned immediately

evaluateAsync():
  → status: SUBMITTED → EVALUATING
  → evaluator.evaluate(ctx) resolves
  → evaluation saved, status → COMPLETED
  → on error: status → FAILED

Frontend polls GET /attempts/:id/submissions/:subId every 2s
  → renders status: Evaluating / Complete / Failed
  → on Complete: renders full evaluation accordion
```

**No duplicate processing:** the attempt is loaded fresh from the repository before each status update.

---

## 6. Change Test A: New Submission Format (e.g., diagrams)

Today: `SubmissionFormat.TEXT | CODE | COMBINED`

To add diagram support:
1. Add `DIAGRAM` to `SubmissionFormat`
2. Add `content.diagram` field to `Submission`
3. Extend `PracticeService._validateSubmission` to accept it
4. Extend the AI evaluator prompt to handle diagram text (e.g., parsed PlantUML)
5. UI: add a Diagram tab to the editor

**Nothing in Problem, Rubric, Evaluation, or Attempt changes.**

---

## 7. Scale (practical judgement, not HLD)

- Evaluation takes 5–15 seconds (AI call). This is handled by async + polling; the main request returns in < 50ms.
- If load grows: the simplest separation would be pulling the evaluator into a separate worker process that reads from a queue. The `PracticeService` writes to the queue; the worker writes back to the evaluation repo.
- If persistence is needed: replace the three in-memory repositories with Postgres-backed implementations that satisfy the same interface.

---

## 8. Key Trade-offs

| Decision | Alternative | Why chosen |
|----------|-------------|------------|
| In-memory storage | Postgres | Removes setup friction for MVP review |
| No Express | Express/Fastify | Zero dependencies; demonstrates built-in http is enough |
| Text + code submission | Diagrams | Diagrams add parsing complexity for marginal signal |
| One Attempt per user per problem | Multiple attempts | Simplifies history; retry loop is the core experience |
| Polling, not WebSocket | WebSocket | Simpler server; evaluation takes 5–15s so 2s polling is acceptable |
| No auth | JWT / session | Out of scope for a 2-day domain-design MVP |

---

## 9. Limitations (explicit)

- In-memory data is lost on restart
- No auth — userId is a client-generated random string
- AI evaluation costs money; there is no rate limiting on submit
- Diagram submission not supported
- Requirement coverage heuristic (deterministic check) is keyword-based, not semantic
