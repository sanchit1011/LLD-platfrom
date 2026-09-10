/**
 * Core Domain Models for LLD Practice Platform
 *
 * Design decisions:
 * - Each class owns a single responsibility and is immutable after creation
 * - IDs are generated externally (repository concern, not domain)
 * - Status transitions are validated by the domain, not the caller
 * - No framework coupling — pure JS objects
 */

// ─────────────────────────────────────────────
//  Value Objects
// ─────────────────────────────────────────────

class ProblemId {
  constructor(value) {
    if (!value || typeof value !== "string") throw new Error("Invalid ProblemId");
    this.value = value;
  }
  toString() { return this.value; }
  equals(other) { return other instanceof ProblemId && other.value === this.value; }
}

class AttemptId {
  constructor(value) {
    if (!value || typeof value !== "string") throw new Error("Invalid AttemptId");
    this.value = value;
  }
  toString() { return this.value; }
}

// ─────────────────────────────────────────────
//  Rubric — defines what evaluation checks
// ─────────────────────────────────────────────

class RubricCriterion {
  constructor({ id, name, description, weight, deterministic = false }) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.weight = weight;           // 0–1, sum across criteria = 1
    this.deterministic = deterministic; // true = rule-based, false = AI-judged
  }
}

class Rubric {
  constructor(criteria) {
    const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      throw new Error(`Rubric weights must sum to 1.0, got ${totalWeight}`);
    }
    this.criteria = criteria;
  }

  getCriterion(id) {
    return this.criteria.find(c => c.id === id) || null;
  }
}

// ─────────────────────────────────────────────
//  Problem — an LLD challenge
// ─────────────────────────────────────────────

const Difficulty = Object.freeze({ EASY: "easy", MEDIUM: "medium", HARD: "hard" });
const Category   = Object.freeze({ OOP: "oop", PATTERNS: "patterns", CONCURRENCY: "concurrency" });

class Problem {
  constructor({ id, title, difficulty, category, statement, requirements, constraints, hints, rubric, createdAt }) {
    this.id          = new ProblemId(id);
    this.title       = title;
    this.difficulty  = difficulty;
    this.category    = category;
    this.statement   = statement;
    this.requirements = requirements; // string[]
    this.constraints = constraints;   // string[]
    this.hints       = hints;         // string[]
    this.rubric      = rubric;        // Rubric
    this.createdAt   = createdAt || new Date();
  }
}

// ─────────────────────────────────────────────
//  Submission — what the learner sends
// ─────────────────────────────────────────────

const SubmissionFormat = Object.freeze({ TEXT: "text", CODE: "code", COMBINED: "combined" });

const SubmissionStatus = Object.freeze({
  SUBMITTED:  "submitted",
  EVALUATING: "evaluating",
  COMPLETED:  "completed",
  FAILED:     "failed",
});

/**
 * Valid transitions:
 *   SUBMITTED → EVALUATING → COMPLETED
 *   SUBMITTED → EVALUATING → FAILED
 *   SUBMITTED → FAILED  (if evaluation cannot even start)
 */
const VALID_TRANSITIONS = {
  [SubmissionStatus.SUBMITTED]:  [SubmissionStatus.EVALUATING, SubmissionStatus.FAILED],
  [SubmissionStatus.EVALUATING]: [SubmissionStatus.COMPLETED,  SubmissionStatus.FAILED],
  [SubmissionStatus.COMPLETED]:  [],
  [SubmissionStatus.FAILED]:     [],
};

class Submission {
  constructor({ id, attemptId, problemId, format, content, submittedAt, status }) {
    this.id         = id;
    this.attemptId  = attemptId;
    // problemId may already be a ProblemId value object (when spread from another Submission)
    this.problemId  = problemId instanceof ProblemId ? problemId : new ProblemId(problemId);
    this.format     = format;
    this.content    = content;   // { design?: string, code?: string }
    this.submittedAt = submittedAt || new Date();
    this.status     = status || SubmissionStatus.SUBMITTED;
  }

  /** Returns a new Submission with updated status (immutable transition) */
  transition(newStatus) {
    const allowed = VALID_TRANSITIONS[this.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Cannot transition from ${this.status} → ${newStatus}`);
    }
    return new Submission({ ...this, status: newStatus });
  }

  isTerminal() {
    return [SubmissionStatus.COMPLETED, SubmissionStatus.FAILED].includes(this.status);
  }
}

// ─────────────────────────────────────────────
//  CriterionResult — one evaluated rubric row
// ─────────────────────────────────────────────

class CriterionResult {
  constructor({ criterionId, score, evidence, concern, suggestion, confidence }) {
    this.criterionId = criterionId;
    this.score      = score;       // 0–10
    this.evidence   = evidence;    // what in the submission supports this score
    this.concern    = concern;     // what is weak or missing
    this.suggestion = suggestion;  // concrete improvement
    this.confidence = confidence;  // "high" | "medium" | "low"
  }
}

// ─────────────────────────────────────────────
//  Evaluation — the full evaluation of a submission
// ─────────────────────────────────────────────

class Evaluation {
  constructor({ id, submissionId, problemId, results, overallScore, summary, evaluatedAt, evaluatorType }) {
    this.id            = id;
    this.submissionId  = submissionId;
    this.problemId     = problemId instanceof ProblemId ? problemId : new ProblemId(problemId);
    this.results       = results;       // CriterionResult[]
    this.overallScore  = overallScore;  // 0–100
    this.summary       = summary;       // plain-text summary
    this.evaluatedAt   = evaluatedAt || new Date();
    this.evaluatorType = evaluatorType; // "ai" | "deterministic" | "hybrid"
  }

  getResult(criterionId) {
    return this.results.find(r => r.criterionId === criterionId) || null;
  }
}

// ─────────────────────────────────────────────
//  Attempt — a learner's session on a problem
//  Owns multiple submissions (retry loop)
// ─────────────────────────────────────────────

class Attempt {
  constructor({ id, userId, problemId, submissions, startedAt, lastActiveAt }) {
    // id may be a plain string or an AttemptId value object (when spread from another Attempt)
    this.id           = id instanceof AttemptId ? id : new AttemptId(id);
    this.userId       = userId;
    // problemId may already be a ProblemId value object
    this.problemId    = problemId instanceof ProblemId ? problemId : new ProblemId(problemId);
    this.submissions  = submissions || [];
    this.startedAt    = startedAt    || new Date();
    this.lastActiveAt = lastActiveAt || new Date();
  }

  latestSubmission() {
    return this.submissions.length > 0
      ? this.submissions[this.submissions.length - 1]
      : null;
  }

  submissionCount() { return this.submissions.length; }

  addSubmission(submission) {
    return new Attempt({
      ...this,
      submissions:  [...this.submissions, submission],
      lastActiveAt: new Date(),
    });
  }
}

module.exports = {
  ProblemId, AttemptId,
  RubricCriterion, Rubric,
  Problem, Difficulty, Category,
  Submission, SubmissionFormat, SubmissionStatus, VALID_TRANSITIONS,
  CriterionResult,
  Evaluation,
  Attempt,
};
