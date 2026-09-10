# AI Usage

This document covers 5 meaningful AI-assisted decisions made during the 2-day build.
For each: what the AI suggested, what I accepted or changed, and why.

---

## 1. Rubric Output Shape

**What I asked:** How should the AI evaluator return structured feedback so it's consistent across submissions?

**What the AI suggested:**
Return a flat JSON array with one object per criterion:
```json
{ "criterionId": "...", "score": 7, "evidence": "...", "concern": "...", "suggestion": "...", "confidence": "high" }
```
It suggested including `confidence` to surface uncertainty in AI judgment.

**What I accepted:** The full shape including `confidence`. This is directly reflected in `CriterionResult` and rendered as a coloured dot in the UI. Low-confidence results are visually distinguished, which is honest about AI limitations.

**What I changed:** The AI initially suggested a nested `"feedback": { "positive": "...", "negative": "..." }` structure. I flattened it to `evidence` + `concern` + `suggestion` because: (a) `evidence` is the most important field — it proves the AI actually read the submission, (b) the flat shape is easier to parse reliably, and (c) the three-field structure maps directly to the display accordion.

---

## 2. Evaluation Prompt Design

**What I asked:** Write a prompt that evaluates an LLD submission against a rubric without just validating the candidate's choices.

**What the AI suggested:**
It drafted a prompt that included: "do not treat any single valid design as the only correct answer" and "score 8–10 means well-met, not perfect."

**What I accepted:** Both instructions. The "no single correct answer" instruction is specifically important for LLD where a Strategy Pattern and a simple switch-case can both be defensible.

**What I changed:** The AI's first prompt asked for prose feedback with scores embedded in the text. I changed it to require JSON-only output with no prose preamble. Prose output required fragile parsing; structured output made `_parseResponse` reliable and allowed a clean fallback when parsing fails (return low-confidence results, not an error).

The AI also suggested including a reference solution in the prompt. I rejected this: it biases the evaluator toward one valid design and contradicts the "no single correct answer" principle.

---

## 3. Status Transition Model

**What I asked:** What states should a submission go through, and how should transitions be validated?

**What the AI suggested:**
`PENDING → IN_PROGRESS → DONE | ERROR` with a simple string comparison for transitions.

**What I accepted:** The concept of explicit named states stored on the submission.

**What I changed:** Three things:
- Renamed to `SUBMITTED → EVALUATING → COMPLETED | FAILED` — names that describe what has happened, not internal system states
- Replaced string comparison with a `VALID_TRANSITIONS` map and enforcement in `Submission.transition()` — invalid transitions throw immediately in the domain layer, not silently fail at the service level
- Made transitions immutable: `transition()` returns a new `Submission` rather than mutating the existing one, consistent with the value-object design of the domain layer

---

## 4. Repository Interface Design

**What I asked:** How should repositories be structured so they can be swapped from in-memory to Postgres without touching the service layer?

**What the AI suggested:**
Use a base class with generic `get`, `set`, `list` methods and specialise per entity.

**What I accepted:** The idea of a shared `InMemoryStore` base class with `_save`, `_findById`, `_findAll`.

**What I changed:** I made the public repository methods entity-specific (`findByUserAndProblem`, `findBySubmissionId`) rather than exposing a generic query interface. A generic `query({ userId, problemId })` interface looks clean but couples callers to the query shape, which changes when you move to SQL. Entity-specific methods are explicit contracts that a Postgres implementation can satisfy with a `WHERE` clause without the caller knowing.

The AI's base class also had `update()`. I removed it entirely — the pattern is load-modify-save, not in-place update, to stay consistent with immutable domain objects.

---

## 5. Frontend Polling vs. WebSocket

**What I asked:** How should the frontend know when evaluation is complete?

**What the AI suggested:**
WebSocket for real-time updates — send an event when evaluation completes.

**What I considered:** WebSockets would be the right answer at scale. But for this MVP:
- Evaluation takes 5–15 seconds, so 2-second polling adds at most one extra round-trip
- WebSocket adds server-side event management and more complex connection handling
- The assignment scope is LLD domain design, not real-time infrastructure

**What I chose:** Long-polling at 2-second intervals, capped at 2 minutes. The client sends `GET /attempts/:id/submissions/:subId`; the server returns the current status. When `status === "completed"` and `evaluation !== null`, the client stops polling and renders the result.

The AI's suggestion was technically correct and I would use it if this were a production system. For a focused MVP where the core value is the evaluation rubric, polling is the right trade-off.
