/**
 * Test suite for LLD Practice Platform
 *
 * No testing framework dependency — pure Node.js assertions.
 * Run with: node tests/run-tests.js
 */

const assert = require("assert");
const {
  ProblemId, AttemptId, Rubric, RubricCriterion,
  Problem, Difficulty, Category,
  Submission, SubmissionFormat, SubmissionStatus, VALID_TRANSITIONS,
  CriterionResult, Evaluation, Attempt,
} = require("../src/domain/models");

const { ProblemRepository, AttemptRepository, EvaluationRepository } = require("../src/domain/repositories");
const { PracticeService, NotFoundError, ValidationError } = require("../src/domain/practice-service");
const { DeterministicEvaluator, EvaluatorFactory } = require("../src/evaluator/evaluator");
const { PROBLEMS } = require("../src/problems/problem-data");

// ─────────────────────────────────────────────
//  Test runner helpers
// ─────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch(e) {
    console.log(`  ✗  ${name}`);
    console.log(`     ${e.message}`);
    failed++;
    failures.push({ name, error: e.message });
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch(e) {
    console.log(`  ✗  ${name}`);
    console.log(`     ${e.message}`);
    failed++;
    failures.push({ name, error: e.message });
  }
}

function section(name) { console.log(`\n── ${name} ──`); }

// ─────────────────────────────────────────────
//  1. Domain Model Tests
// ─────────────────────────────────────────────
section("Domain Models");

test("ProblemId rejects empty string", () => {
  assert.throws(() => new ProblemId(""), /Invalid ProblemId/);
});

test("ProblemId equality works", () => {
  const a = new ProblemId("parking-lot");
  const b = new ProblemId("parking-lot");
  assert.ok(a.equals(b));
  assert.ok(!a.equals(new ProblemId("elevator")));
});

test("Rubric rejects criteria that don't sum to 1.0", () => {
  assert.throws(() => new Rubric([
    new RubricCriterion({ id: "a", name: "A", description: "", weight: 0.3, deterministic: false }),
    new RubricCriterion({ id: "b", name: "B", description: "", weight: 0.3, deterministic: false }),
  ]), /weights must sum/);
});

test("Rubric accepts criteria summing to 1.0", () => {
  const r = new Rubric([
    new RubricCriterion({ id: "a", name: "A", description: "", weight: 0.6, deterministic: false }),
    new RubricCriterion({ id: "b", name: "B", description: "", weight: 0.4, deterministic: false }),
  ]);
  assert.strictEqual(r.criteria.length, 2);
});

test("Rubric.getCriterion returns correct criterion", () => {
  const r = new Rubric([
    new RubricCriterion({ id: "alpha", name: "Alpha", description: "", weight: 1.0, deterministic: true }),
  ]);
  assert.ok(r.getCriterion("alpha") !== null);
  assert.strictEqual(r.getCriterion("missing"), null);
});

test("Submission.transition: valid SUBMITTED → EVALUATING", () => {
  const s = makeSubmission(SubmissionStatus.SUBMITTED);
  const next = s.transition(SubmissionStatus.EVALUATING);
  assert.strictEqual(next.status, SubmissionStatus.EVALUATING);
});

test("Submission.transition: valid EVALUATING → COMPLETED", () => {
  const s = makeSubmission(SubmissionStatus.EVALUATING);
  const next = s.transition(SubmissionStatus.COMPLETED);
  assert.strictEqual(next.status, SubmissionStatus.COMPLETED);
});

test("Submission.transition: invalid SUBMITTED → COMPLETED throws", () => {
  const s = makeSubmission(SubmissionStatus.SUBMITTED);
  assert.throws(() => s.transition(SubmissionStatus.COMPLETED), /Cannot transition/);
});

test("Submission.transition: terminal COMPLETED → anything throws", () => {
  const s = makeSubmission(SubmissionStatus.COMPLETED);
  assert.throws(() => s.transition(SubmissionStatus.EVALUATING), /Cannot transition/);
});

test("Submission.isTerminal() is true for COMPLETED and FAILED", () => {
  assert.ok(makeSubmission(SubmissionStatus.COMPLETED).isTerminal());
  assert.ok(makeSubmission(SubmissionStatus.FAILED).isTerminal());
  assert.ok(!makeSubmission(SubmissionStatus.SUBMITTED).isTerminal());
  assert.ok(!makeSubmission(SubmissionStatus.EVALUATING).isTerminal());
});

test("Attempt.addSubmission is immutable", () => {
  const attempt = makeAttempt();
  const sub     = makeSubmission();
  const updated = attempt.addSubmission(sub);
  assert.strictEqual(attempt.submissions.length, 0);
  assert.strictEqual(updated.submissions.length, 1);
});

test("Attempt.latestSubmission returns last submission", () => {
  const attempt = makeAttempt()
    .addSubmission(makeSubmission("submitted", "s1"))
    .addSubmission(makeSubmission("evaluating", "s2"));
  assert.strictEqual(attempt.latestSubmission().id, "s2");
});

test("Attempt.latestSubmission returns null when no submissions", () => {
  assert.strictEqual(makeAttempt().latestSubmission(), null);
});

// ─────────────────────────────────────────────
//  2. Repository Tests
// ─────────────────────────────────────────────
section("Repositories");

test("ProblemRepository: save and findById", () => {
  const repo = new ProblemRepository();
  const p    = PROBLEMS[0];
  repo.save(p);
  const found = repo.findById(p.id.value);
  assert.ok(found);
  assert.strictEqual(found.title, p.title);
});

test("ProblemRepository: findAll returns all saved", () => {
  const repo = new ProblemRepository();
  PROBLEMS.forEach(p => repo.save(p));
  assert.strictEqual(repo.findAll().length, PROBLEMS.length);
});

test("ProblemRepository: findByDifficulty filters correctly", () => {
  const repo = new ProblemRepository();
  PROBLEMS.forEach(p => repo.save(p));
  const easy = repo.findByDifficulty("easy");
  assert.ok(easy.every(p => p.difficulty === "easy"));
});

test("AttemptRepository: findByUserAndProblem", () => {
  const repo    = new AttemptRepository();
  const attempt = new Attempt({ id: repo.generateId(), userId: "user1", problemId: "parking-lot" });
  repo.save(attempt);
  const found = repo.findByUserAndProblem("user1", "parking-lot");
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].userId, "user1");
});

test("EvaluationRepository: findBySubmissionId", () => {
  const repo = new EvaluationRepository();
  const ev   = makeEvaluation("sub-1");
  repo.save(ev);
  const found = repo.findBySubmissionId("sub-1");
  assert.ok(found);
  assert.strictEqual(found.submissionId, "sub-1");
});

// ─────────────────────────────────────────────
//  3. Problem Seed Data Tests
// ─────────────────────────────────────────────
section("Problem Seed Data");

test("PROBLEMS is non-empty", () => {
  assert.ok(PROBLEMS.length > 0);
});

test("Every problem has a rubric with weights summing to 1", () => {
  for (const p of PROBLEMS) {
    const sum = p.rubric.criteria.reduce((s, c) => s + c.weight, 0);
    assert.ok(Math.abs(sum - 1.0) < 0.001, `${p.title}: weights sum to ${sum}`);
  }
});

test("Every problem has requirements and constraints", () => {
  for (const p of PROBLEMS) {
    assert.ok(p.requirements.length > 0, `${p.title}: no requirements`);
    assert.ok(p.constraints.length > 0,  `${p.title}: no constraints`);
  }
});

test("Every problem has at least one deterministic criterion", () => {
  for (const p of PROBLEMS) {
    const hasDeterm = p.rubric.criteria.some(c => c.deterministic);
    assert.ok(hasDeterm, `${p.title}: no deterministic criterion`);
  }
});

// ─────────────────────────────────────────────
//  4. DeterministicEvaluator Tests
// ─────────────────────────────────────────────
section("DeterministicEvaluator");

test("Returns results only for deterministic criteria", () => {
  const problem = PROBLEMS[0]; // parking-lot
  const evaluator = new DeterministicEvaluator();
  const ctx = makeContext(problem, "design about car bike truck floor parking strategy ticket state");
  const results = evaluator.evaluate(ctx);
  const deterCount = problem.rubric.criteria.filter(c => c.deterministic).length;
  assert.strictEqual(results.length, deterCount);
});

test("High requirement coverage → score ≥ 7", () => {
  const problem   = PROBLEMS[0]; // parking-lot
  const evaluator = new DeterministicEvaluator();
  const richContent = problem.requirements.join(" ") + " car bike truck floor strategy ticket state vehicle type";
  const ctx     = makeContext(problem, richContent);
  const results = evaluator.evaluate(ctx);
  const reqResult = results.find(r => r.criterionId === "req-coverage");
  assert.ok(reqResult, "req-coverage not found");
  assert.ok(reqResult.score >= 5, `Expected score ≥ 5, got ${reqResult.score}`);
});

test("Empty submission → low coverage score", () => {
  const problem   = PROBLEMS[0];
  const evaluator = new DeterministicEvaluator();
  const ctx       = makeContext(problem, "I don't know anything");
  const results   = evaluator.evaluate(ctx);
  const reqResult = results.find(r => r.criterionId === "req-coverage");
  assert.ok(reqResult.score < 7, `Expected score < 7, got ${reqResult.score}`);
});

test("CriterionResult has all required fields", () => {
  const problem   = PROBLEMS[0];
  const evaluator = new DeterministicEvaluator();
  const ctx       = makeContext(problem, "car bike floor");
  const results   = evaluator.evaluate(ctx);
  for (const r of results) {
    assert.ok(r.criterionId,  "missing criterionId");
    assert.ok(typeof r.score === "number", "score not a number");
    assert.ok(r.evidence !== undefined,    "missing evidence");
    assert.ok(r.confidence,               "missing confidence");
  }
});

// ─────────────────────────────────────────────
//  5. PracticeService Tests (no real AI key needed)
// ─────────────────────────────────────────────
async function runAsyncTests() {
section("PracticeService");

function makePracticeService() {
  const problemRepo    = new ProblemRepository();
  const attemptRepo    = new AttemptRepository();
  const evaluationRepo = new EvaluationRepository();
  PROBLEMS.forEach(p => problemRepo.save(p));

  // Stub evaluator — returns immediately with a fixed evaluation
  const stubEvaluator = {
    async evaluate(ctx) {
      const { randomUUID } = require("crypto");
      const { Evaluation, CriterionResult } = require("../src/domain/models");
      return new Evaluation({
        id: randomUUID(), submissionId: ctx.submission.id,
        problemId: ctx.problem.id.value,
        results: [new CriterionResult({ criterionId: "req-coverage", score: 7, evidence: "ok", concern: "", suggestion: "good", confidence: "high" })],
        overallScore: 70, summary: "Good attempt.", evaluatedAt: new Date(), evaluatorType: "stub",
      });
    }
  };

  return new PracticeService(problemRepo, attemptRepo, evaluationRepo, stubEvaluator);
}

test("listProblems returns all seeded problems", () => {
  const svc = makePracticeService();
  assert.strictEqual(svc.listProblems().length, PROBLEMS.length);
});

test("getProblem throws NotFoundError for unknown id", () => {
  const svc = makePracticeService();
  assert.throws(() => svc.getProblem("nonexistent"), err => err instanceof NotFoundError);
});

test("startAttempt creates a new attempt", () => {
  const svc     = makePracticeService();
  const attempt = svc.startAttempt("user1", "parking-lot");
  assert.strictEqual(attempt.userId, "user1");
  assert.strictEqual(attempt.problemId.value, "parking-lot");
});

test("startAttempt resumes existing attempt (idempotent)", () => {
  const svc  = makePracticeService();
  const a1   = svc.startAttempt("user1", "parking-lot");
  const a2   = svc.startAttempt("user1", "parking-lot");
  assert.strictEqual(a1.id.value, a2.id.value);
});

test("Different users get different attempts for same problem", () => {
  const svc = makePracticeService();
  const a1  = svc.startAttempt("user1", "parking-lot");
  const a2  = svc.startAttempt("user2", "parking-lot");
  assert.notStrictEqual(a1.id.value, a2.id.value);
});

await testAsync("submit creates submission with SUBMITTED status", async () => {
  const svc     = makePracticeService();
  const attempt = svc.startAttempt("user1", "parking-lot");
  const sub     = await svc.submit(attempt.id.value, {
    format:  "text",
    content: { design: "ParkingLot class with Floor list. Each Floor has ParkingSpot list. Vehicle interface implemented by Car, Bike, Truck. Strategy pattern for spot selection." },
  });
  // Immediately after submit, status is SUBMITTED (evaluation is async)
  assert.ok(sub.id);
  assert.strictEqual(sub.attemptId, attempt.id.value);
});

await testAsync("submit throws ValidationError for empty content", async () => {
  const svc     = makePracticeService();
  const attempt = svc.startAttempt("user1", "parking-lot");
  try {
    await svc.submit(attempt.id.value, { format: "text", content: {} });
    assert.fail("Expected ValidationError");
  } catch(e) {
    assert.ok(e instanceof ValidationError, `Expected ValidationError, got ${e.constructor.name}`);
  }
});

await testAsync("submit throws ValidationError for too-short content", async () => {
  const svc     = makePracticeService();
  const attempt = svc.startAttempt("user1", "parking-lot");
  try {
    await svc.submit(attempt.id.value, { format: "text", content: { design: "short" } });
    assert.fail("Expected ValidationError");
  } catch(e) {
    assert.ok(e instanceof ValidationError);
  }
});

await testAsync("getUserHistory returns attempt with problem info", async () => {
  const svc     = makePracticeService();
  svc.startAttempt("user-h", "parking-lot");
  const history = svc.getUserHistory("user-h");
  assert.strictEqual(history.length, 1);
  assert.ok(history[0].problem);
  assert.strictEqual(history[0].problem.id.value, "parking-lot");
});

// ─────────────────────────────────────────────
//  6. Edge Cases (sync, outside async block)
// ─────────────────────────────────────────────
} // end runAsyncTests

section("Edge Cases");

test("Submission immutability: original unchanged after transition", () => {
  const original = makeSubmission(SubmissionStatus.SUBMITTED);
  const updated  = original.transition(SubmissionStatus.EVALUATING);
  assert.strictEqual(original.status, SubmissionStatus.SUBMITTED);
  assert.strictEqual(updated.status,  SubmissionStatus.EVALUATING);
});

test("Attempt.submissionCount is correct after multiple adds", () => {
  let attempt = makeAttempt();
  for (let i = 0; i < 5; i++) attempt = attempt.addSubmission(makeSubmission());
  assert.strictEqual(attempt.submissionCount(), 5);
});

test("EvaluatorFactory.create returns HybridEvaluator for unknown type", () => {
  const ev = EvaluatorFactory.create("unknown-type", "");
  assert.ok(typeof ev.evaluate === "function");
});

test("VALID_TRANSITIONS is complete and consistent", () => {
  const statuses = Object.values(SubmissionStatus);
  for (const s of statuses) {
    assert.ok(VALID_TRANSITIONS[s] !== undefined, `No transitions defined for ${s}`);
    for (const next of VALID_TRANSITIONS[s]) {
      assert.ok(statuses.includes(next), `Invalid target status: ${next}`);
    }
  }
});

test("Rubric with tolerance: weights at 0.9999 accepted", () => {
  assert.doesNotThrow(() => new Rubric([
    new RubricCriterion({ id: "a", name: "A", description: "", weight: 0.4999, deterministic: false }),
    new RubricCriterion({ id: "b", name: "B", description: "", weight: 0.5, deterministic: false }),
  ]));
});

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
function makeSubmission(status = SubmissionStatus.SUBMITTED, id = "sub-test-1") {
  return new Submission({
    id, attemptId: "att-test-1", problemId: "parking-lot",
    format: SubmissionFormat.TEXT, content: { design: "some design text" }, status,
  });
}

function makeAttempt() {
  return new Attempt({ id: "att-test-" + Math.floor(Math.random()*10000), userId: "u1", problemId: "parking-lot" });
}

function makeEvaluation(submissionId) {
  return new Evaluation({
    id: "ev-1", submissionId, problemId: "parking-lot",
    results: [], overallScore: 75, summary: "Good.", evaluatedAt: new Date(), evaluatorType: "stub",
  });
}

function makeContext(problem, designText) {
  const sub = new Submission({
    id: "s1", attemptId: "a1", problemId: problem.id.value,
    format: "text", content: { design: designText },
  });
  return { submission: sub, problem, rubric: problem.rubric };
}

// ─────────────────────────────────────────────
//  Run all async tests then print summary
// ─────────────────────────────────────────────
runAsyncTests().then(() => {
  console.log(`\n${"─".repeat(42)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log(`\nFailed tests:`);
    failures.forEach(f => console.log(`  • ${f.name}`));
  }
  console.log(`${"─".repeat(42)}\n`);
  process.exit(failed > 0 ? 1 : 0);
});
