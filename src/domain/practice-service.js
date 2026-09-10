/**
 * PracticeService — Orchestrates the Practice Loop
 *
 * Responsibilities:
 *  - Start an attempt (or reuse an existing one for the same user+problem)
 *  - Accept a submission and persist it before evaluation starts
 *  - Trigger async evaluation; update submission status on completion/failure
 *  - Provide attempt history
 *
 * Key design choice: submission is persisted as SUBMITTED *before* evaluation
 * starts. If evaluation fails, the submission is not lost — it transitions to
 * FAILED and the user can resubmit. This satisfies "store before evaluate".
 */

const { randomUUID } = require("crypto");
const {
  Attempt, Submission, SubmissionFormat, SubmissionStatus,
} = require("./models");
const { EvaluationContext } = require("../evaluator/evaluator");

class PracticeService {
  /**
   * @param {ProblemRepository}    problemRepo
   * @param {AttemptRepository}    attemptRepo
   * @param {EvaluationRepository} evaluationRepo
   * @param {HybridEvaluator}      evaluator
   */
  constructor(problemRepo, attemptRepo, evaluationRepo, evaluator) {
    this.problemRepo     = problemRepo;
    this.attemptRepo     = attemptRepo;
    this.evaluationRepo  = evaluationRepo;
    this.evaluator       = evaluator;
  }

  // ── Problem access ──────────────────────────────────────

  listProblems() { return this.problemRepo.findAll(); }

  getProblem(problemId) {
    const p = this.problemRepo.findById(problemId);
    if (!p) throw new NotFoundError(`Problem not found: ${problemId}`);
    return p;
  }

  // ── Attempt management ──────────────────────────────────

  /**
   * Start or resume an attempt.
   * One attempt per user per problem (retry loop model).
   */
  startAttempt(userId, problemId) {
    const problem  = this.getProblem(problemId);
    const existing = this.attemptRepo.findByUserAndProblem(userId, problemId);

    if (existing.length > 0) {
      // Resume the most recent attempt
      return existing.sort((a, b) => b.startedAt - a.startedAt)[0];
    }

    const attempt = new Attempt({
      id:        this.attemptRepo.generateId(),
      userId,
      problemId: problem.id.value,
    });
    return this.attemptRepo.save(attempt);
  }

  getAttempt(attemptId) {
    const a = this.attemptRepo.findById(attemptId);
    if (!a) throw new NotFoundError(`Attempt not found: ${attemptId}`);
    return a;
  }

  getUserHistory(userId) {
    const attempts = this.attemptRepo.findByUser(userId);
    return attempts.map(attempt => ({
      attempt,
      problem:    this.problemRepo.findById(attempt.problemId.value),
      evaluation: this._latestEvaluation(attempt),
    }));
  }

  // ── Submission ──────────────────────────────────────────

  /**
   * Submit a solution.
   * 1. Validate inputs
   * 2. Create Submission (status = SUBMITTED) and persist
   * 3. Add to attempt, save attempt
   * 4. Trigger async evaluation (non-blocking)
   * 5. Return submission immediately so UI can show "Evaluating…"
   */
  async submit(attemptId, { format, content }) {
    this._validateSubmission(format, content);

    let attempt = this.getAttempt(attemptId);
    const problem = this.getProblem(attempt.problemId.value);

    const submission = new Submission({
      id:         randomUUID(),
      attemptId,
      problemId:  problem.id.value,
      format:     format || SubmissionFormat.COMBINED,
      content:    content || {},
      status:     SubmissionStatus.SUBMITTED,
    });

    // Persist submission before evaluation starts
    attempt = attempt.addSubmission(submission);
    this.attemptRepo.save(attempt);

    // Fire-and-forget evaluation (do not await)
    this._evaluateAsync(submission, attempt, problem).catch(err => {
      console.error("[PracticeService] evaluation error:", err.message);
    });

    return submission;
  }

  // ── Evaluation result retrieval ─────────────────────────

  getEvaluation(submissionId) {
    return this.evaluationRepo.findBySubmissionId(submissionId);
  }

  getSubmissionStatus(attemptId, submissionId) {
    const attempt = this.getAttempt(attemptId);
    const sub     = attempt.submissions.find(s => s.id === submissionId);
    if (!sub) throw new NotFoundError(`Submission not found: ${submissionId}`);
    const evaluation = this.evaluationRepo.findBySubmissionId(submissionId);
    return { submission: sub, evaluation };
  }

  // ── Private helpers ─────────────────────────────────────

  async _evaluateAsync(submission, attempt, problem) {
    const submittingId = submission.id;

    // Transition → EVALUATING
    this._updateSubmissionStatus(attempt.id.value, submittingId, SubmissionStatus.EVALUATING);

    try {
      const ctx = new EvaluationContext({ submission, problem });
      const evaluation = await this.evaluator.evaluate(ctx);
      evaluation.attemptId = attempt.id.value;

      this.evaluationRepo.save(evaluation);
      this._updateSubmissionStatus(attempt.id.value, submittingId, SubmissionStatus.COMPLETED);
    } catch (err) {
      console.error("[PracticeService] evaluator threw:", err.message);
      this._updateSubmissionStatus(attempt.id.value, submittingId, SubmissionStatus.FAILED);
    }
  }

  /** Mutates the submission inside the attempt (stored as value objects, reload pattern) */
  _updateSubmissionStatus(attemptId, submissionId, newStatus) {
    const attempt = this.attemptRepo.findById(attemptId);
    if (!attempt) return;

    const updated = attempt.submissions.map(s => {
      if (s.id !== submissionId) return s;
      try { return s.transition(newStatus); }
      catch { return s; } // already terminal
    });

    this.attemptRepo.save(new (attempt.constructor)({
      ...attempt,
      submissions: updated,
    }));
  }

  _latestEvaluation(attempt) {
    const subs = attempt.submissions;
    for (let i = subs.length - 1; i >= 0; i--) {
      const ev = this.evaluationRepo.findBySubmissionId(subs[i].id);
      if (ev) return ev;
    }
    return null;
  }

  _validateSubmission(format, content) {
    if (!content || ((!content.design || !content.design.trim()) && (!content.code || !content.code.trim()))) {
      throw new ValidationError("Submission must include at least a design explanation or code.");
    }
    const combined = (content.design || "") + (content.code || "");
    if (combined.trim().length < 50) {
      throw new ValidationError("Submission is too short to be meaningful (< 50 characters).");
    }
  }
}

// ── Domain Errors ─────────────────────────────────────────

class NotFoundError extends Error {
  constructor(msg) { super(msg); this.name = "NotFoundError"; this.statusCode = 404; }
}

class ValidationError extends Error {
  constructor(msg) { super(msg); this.name = "ValidationError"; this.statusCode = 400; }
}

module.exports = { PracticeService, NotFoundError, ValidationError };
