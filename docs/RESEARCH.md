# Research Note: LLD Practice Platform

**Scope:** ~2 hours of research into how learners currently practice LLD and what gaps exist.

---

## 1. The Learner Problem

Low-Level Design practice has a specific and underappreciated difficulty: **there is no single correct answer.**

A learner designing a Parking Lot can produce a correct-looking solution — classes named right, relationships plausible — without understanding *why* those choices are good. Two very different designs can both be valid. This makes self-evaluation nearly impossible and peer evaluation unreliable.

The result is that most LLD practice is **activity without feedback**. A learner "practices" by reading a reference solution and believing they understand it. This is false confidence.

The learner actually needs:
- A clear signal of **where their design falls short** (not just a score)
- **Evidence-based feedback** that cites their own design, not a generic checklist
- A **retry loop** so improvement is visible across attempts, not just one-shot

---

## 2. Existing Approaches Researched

### LeetCode (LLD section, community discussions)
- Problems exist (Parking Lot, LRU Cache, etc.) but feedback is essentially absent
- The learner submits code; no structural design evaluation happens
- Community editorial solutions are good but don't evaluate *your* solution

**Gap:** No feedback mechanism. The loop is: read → write → compare to editorial → guess.

### Educative.io / Grokking the System Design Interview
- Excellent written content for HLD and some LLD
- Format is linear reading, not interactive practice
- No submission or feedback at all

**Gap:** This is a course, not a practice tool. There is no learner-authored content.

### InterviewBit / Pramp
- Mock interview format — useful for interview prep under pressure
- Feedback depends entirely on the human interviewer
- Not repeatable, not structured, not scalable

**Gap:** Human-in-the-loop feedback is high quality but unavailable at scale.

### GitHub repos (e.g., "awesome-low-level-design")
- Collections of reference solutions in Java/Python
- Learner reads reference, writes their own, compares manually
- Zero feedback infrastructure

**Gap:** Same as LeetCode. Passive comparison, no evaluation.

### GitHub Copilot / ChatGPT (prompt-based)
- Many learners already use this: paste design, ask "is this good?"
- Problems: output is inconsistent, no rubric, not comparable across attempts, tends to be validating rather than critical
- No history, no improvement tracking

**Gap:** Ad-hoc AI feedback is better than nothing but inconsistent and not tailored to LLD quality dimensions.

---

## 3. Key Gaps Summary

| Gap | Impact |
|-----|--------|
| No structured rubric across tools | Feedback is vague and incomparable |
| No submission of the learner's own design | Practice is reading, not producing |
| No retry loop | Improvement is invisible |
| Human feedback doesn't scale | Most learners get none |
| AI feedback is unconstrained | "Is this good?" produces noise |

---

## 4. Product Direction

**One clear learner problem to solve:**
> A learner finishes an LLD attempt and genuinely doesn't know if their design is good — or where to improve.

**MVP direction:**
- 5 real LLD problems with full context
- A submission editor (text design, code, or both)
- A fixed rubric per problem — known in advance, so the learner knows what will be evaluated
- AI evaluation that maps to rubric dimensions, cites evidence from the submission, and gives a specific improvement suggestion per criterion
- Attempt history so the learner can see their score change across retries

**What this is not:**
- Not a full LMS or competitive coding platform
- Not trying to replace human review for final preparation
- Not supporting diagram input in MVP (adds significant implementation complexity for marginal early signal)

---

## 5. Submission Format Decision

LLD can be expressed as: text design, code, UML diagram, or a combination.

For this MVP: **text and code, not diagrams.**

Reasoning:
- Text forces the learner to articulate reasoning — the most valuable LLD signal
- Code provides concrete evidence of coupling, abstraction, and testability
- Diagram parsing adds significant implementation effort (OCR or custom format) for modest additional signal in MVP
- The evaluator prompt is richer when the learner has explained their thinking in words

The rubric criterion "Quality of Explanation" directly incentivises text design even when code is provided.
