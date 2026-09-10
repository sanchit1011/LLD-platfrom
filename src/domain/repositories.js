/**
 * In-Memory Repositories
 *
 * Design notes:
 * - Repositories are the only place that know about storage
 * - Domain services depend on repository interfaces, not concrete stores
 * - Easy to swap for a DB later — just implement the same interface
 * - IDs generated here so domain objects stay pure value objects
 */

const { randomUUID } = require("crypto");

// ─────────────────────────────────────────────
//  Generic base repository
// ─────────────────────────────────────────────

class InMemoryStore {
  constructor() { this._data = new Map(); }

  _save(id, entity) { this._data.set(id, entity); return entity; }
  _findById(id)      { return this._data.get(id) || null; }
  _findAll()         { return [...this._data.values()]; }
  _delete(id)        { return this._data.delete(id); }
  _count()           { return this._data.size; }
}

// ─────────────────────────────────────────────
//  ProblemRepository
// ─────────────────────────────────────────────

class ProblemRepository extends InMemoryStore {
  save(problem) { return this._save(problem.id.value, problem); }
  findById(id)  { return this._findById(typeof id === "string" ? id : id.value); }
  findAll()     { return this._findAll(); }

  findByDifficulty(difficulty) {
    return this._findAll().filter(p => p.difficulty === difficulty);
  }

  findByCategory(category) {
    return this._findAll().filter(p => p.category === category);
  }
}

// ─────────────────────────────────────────────
//  AttemptRepository
// ─────────────────────────────────────────────

class AttemptRepository extends InMemoryStore {
  save(attempt)  { return this._save(attempt.id.value, attempt); }
  findById(id)   { return this._findById(typeof id === "string" ? id : id.value); }

  findByUserAndProblem(userId, problemId) {
    return this._findAll().filter(
      a => a.userId === userId && a.problemId.value === problemId
    );
  }

  findByUser(userId) {
    return this._findAll()
      .filter(a => a.userId === userId)
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  generateId() { return randomUUID(); }
}

// ─────────────────────────────────────────────
//  EvaluationRepository
// ─────────────────────────────────────────────

class EvaluationRepository extends InMemoryStore {
  save(evaluation) { return this._save(evaluation.id, evaluation); }
  findById(id)     { return this._findById(id); }

  findBySubmissionId(submissionId) {
    return this._findAll().find(e => e.submissionId === submissionId) || null;
  }

  findByAttemptId(attemptId) {
    return this._findAll().filter(e => e.attemptId === attemptId);
  }

  generateId() { return randomUUID(); }
}

module.exports = { ProblemRepository, AttemptRepository, EvaluationRepository };
