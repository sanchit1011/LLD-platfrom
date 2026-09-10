/**
 * HTTP Server — thin API layer over PracticeService
 *
 * Routes:
 *   GET  /api/problems
 *   GET  /api/problems/:id
 *   POST /api/attempts          { userId, problemId }
 *   GET  /api/attempts/:id
 *   GET  /api/users/:userId/history
 *   POST /api/attempts/:id/submit   { format, content }
 *   GET  /api/attempts/:id/submissions/:subId
 *   GET  /health
 *   GET  /           → serves frontend HTML
 *
 * Design: no express, no framework — uses Node's built-in http module
 * to keep the prototype dependency-free.
 */

const http = require("http");
const path = require("path");
const fs   = require("fs");

const { ProblemRepository, AttemptRepository, EvaluationRepository } = require("../domain/repositories");
const { PracticeService, NotFoundError, ValidationError } = require("../domain/practice-service");
const { EvaluatorFactory } = require("../evaluator/evaluator");
const { PROBLEMS }          = require("../problems/problem-data");

// ─────────────────────────────────────────────
//  Bootstrap
// ─────────────────────────────────────────────

const PORT    = process.env.PORT    || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || "";

const problemRepo    = new ProblemRepository();
const attemptRepo    = new AttemptRepository();
const evaluationRepo = new EvaluationRepository();

// Seed problems
PROBLEMS.forEach(p => problemRepo.save(p));

const evaluator      = EvaluatorFactory.create("hybrid", API_KEY);
const practiceService = new PracticeService(problemRepo, attemptRepo, evaluationRepo, evaluator);

// ─────────────────────────────────────────────
//  Minimal router helpers
// ─────────────────────────────────────────────

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type":                "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function matchRoute(pattern, pathname) {
  const patParts = pattern.split("/");
  const urlParts = pathname.split("/");
  if (patParts.length !== urlParts.length) return null;
  const params = {};
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(":")) {
      params[patParts[i].slice(1)] = decodeURIComponent(urlParts[i]);
    } else if (patParts[i] !== urlParts[i]) {
      return null;
    }
  }
  return params;
}

// ─────────────────────────────────────────────
//  Request handler
// ─────────────────────────────────────────────

async function handleRequest(req, res) {
  const url      = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method   = req.method;

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    return res.end();
  }

  // Health check
  if (pathname === "/health" && method === "GET") {
    return send(res, 200, { status: "ok", problems: problemRepo.findAll().length });
  }

  // Serve frontend for non-API routes
  if (!pathname.startsWith("/api/")) {
    const htmlPath = path.join(__dirname, "../../public/index.html");
    if (fs.existsSync(htmlPath)) {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(fs.readFileSync(htmlPath, "utf-8"));
    }
    return send(res, 404, { error: "Frontend not found" });
  }

  // ── API Routes ──────────────────────────────

  try {
    let params;

    // GET /api/problems
    if (pathname === "/api/problems" && method === "GET") {
      const difficulty = url.searchParams.get("difficulty");
      const problems   = difficulty
        ? problemRepo.findByDifficulty(difficulty)
        : practiceService.listProblems();
      return send(res, 200, problems.map(serializeProblem));
    }

    // GET /api/problems/:id
    if ((params = matchRoute("/api/problems/:id", pathname)) && method === "GET") {
      const problem = practiceService.getProblem(params.id);
      return send(res, 200, serializeProblem(problem, true));
    }

    // POST /api/attempts
    if (pathname === "/api/attempts" && method === "POST") {
      const body    = await readBody(req);
      const attempt = practiceService.startAttempt(body.userId || "guest", body.problemId);
      return send(res, 200, serializeAttempt(attempt));
    }

    // GET /api/attempts/:id
    if ((params = matchRoute("/api/attempts/:id", pathname)) && method === "GET") {
      const attempt = practiceService.getAttempt(params.id);
      return send(res, 200, serializeAttempt(attempt, true));
    }

    // POST /api/attempts/:id/submit
    if ((params = matchRoute("/api/attempts/:id/submit", pathname)) && method === "POST") {
      const body       = await readBody(req);
      const submission = await practiceService.submit(params.id, body);
      return send(res, 202, serializeSubmission(submission));
    }

    // GET /api/attempts/:id/submissions/:subId
    if ((params = matchRoute("/api/attempts/:attemptId/submissions/:subId", pathname)) && method === "GET") {
      const result = practiceService.getSubmissionStatus(params.attemptId, params.subId);
      return send(res, 200, {
        submission: serializeSubmission(result.submission),
        evaluation: result.evaluation ? serializeEvaluation(result.evaluation) : null,
      });
    }

    // GET /api/users/:userId/history
    if ((params = matchRoute("/api/users/:userId/history", pathname)) && method === "GET") {
      const history = practiceService.getUserHistory(params.userId);
      return send(res, 200, history.map(h => ({
        attempt:    serializeAttempt(h.attempt),
        problem:    h.problem ? serializeProblem(h.problem) : null,
        evaluation: h.evaluation ? serializeEvaluation(h.evaluation) : null,
      })));
    }

    return send(res, 404, { error: "Route not found" });

  } catch (err) {
    if (err instanceof NotFoundError)  return send(res, 404, { error: err.message });
    if (err instanceof ValidationError) return send(res, 400, { error: err.message });
    console.error("[Server]", err);
    return send(res, 500, { error: "Internal server error" });
  }
}

// ─────────────────────────────────────────────
//  Serializers (keep domain objects clean)
// ─────────────────────────────────────────────

function serializeProblem(p, full = false) {
  const base = {
    id:         p.id.value,
    title:      p.title,
    difficulty: p.difficulty,
    category:   p.category,
    statement:  p.statement,
  };
  if (!full) return base;
  return {
    ...base,
    requirements: p.requirements,
    constraints:  p.constraints,
    hints:        p.hints,
    rubric:       {
      criteria: p.rubric.criteria.map(c => ({
        id:            c.id,
        name:          c.name,
        description:   c.description,
        weight:        c.weight,
        deterministic: c.deterministic,
      })),
    },
  };
}

function serializeAttempt(a, full = false) {
  const base = {
    id:           a.id.value,
    userId:       a.userId,
    problemId:    a.problemId.value,
    startedAt:    a.startedAt,
    lastActiveAt: a.lastActiveAt,
    submissionCount: a.submissionCount(),
  };
  if (!full) return base;
  return { ...base, submissions: a.submissions.map(serializeSubmission) };
}

function serializeSubmission(s) {
  return {
    id:          s.id,
    attemptId:   s.attemptId,
    problemId:   s.problemId.value,
    format:      s.format,
    status:      s.status,
    submittedAt: s.submittedAt,
    content:     s.content,
  };
}

function serializeEvaluation(e) {
  return {
    id:            e.id,
    submissionId:  e.submissionId,
    overallScore:  e.overallScore,
    summary:       e.summary,
    evaluatedAt:   e.evaluatedAt,
    evaluatorType: e.evaluatorType,
    results:       e.results.map(r => ({
      criterionId: r.criterionId,
      score:       r.score,
      evidence:    r.evidence,
      concern:     r.concern,
      suggestion:  r.suggestion,
      confidence:  r.confidence,
    })),
  };
}

// ─────────────────────────────────────────────
//  Start server
// ─────────────────────────────────────────────

const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`\n🚀 LLD Practice Platform running at http://localhost:${PORT}`);
  console.log(`   ${PROBLEMS.length} problems loaded`);
  console.log(`   AI key: ${API_KEY ? "✓ set" : "✗ missing (set ANTHROPIC_API_KEY)"}\n`);
});

module.exports = { server, practiceService };
