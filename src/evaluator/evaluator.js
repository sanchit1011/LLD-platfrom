/**
 * Evaluation Pipeline
 *
 * Architecture:
 *   SubmissionEvaluator (interface contract)
 *     ├── DeterministicEvaluator   — fast structural checks (no AI)
 *     ├── AIEvaluator              — AI-judged rubric dimensions
 *     └── HybridEvaluator          — runs deterministic first, then AI for remaining criteria
 *
 * Change test B satisfied: Adding RuleBasedEvaluator or HumanReviewEvaluator
 * only requires implementing SubmissionEvaluator and registering it —
 * the practice flow (PracticeService) is unchanged.
 *
 * Async evaluation: caller stores submission as SUBMITTED, then calls
 * evaluate() which resolves to Evaluation. Status transitions happen inside.
 */

const { randomUUID } = require("crypto");
const { CriterionResult, Evaluation } = require("../domain/models");

// ─────────────────────────────────────────────
//  EvaluationContext — all info an evaluator needs
// ─────────────────────────────────────────────

class EvaluationContext {
  constructor({ submission, problem }) {
    this.submission = submission;
    this.problem    = problem;
    this.rubric     = problem.rubric;
  }
}

// ─────────────────────────────────────────────
//  DeterministicEvaluator
//  Checks structural/completeness signals with rules, no LLM.
// ─────────────────────────────────────────────

class DeterministicEvaluator {
  /** @returns {CriterionResult[]} only for deterministic criteria */
  evaluate(ctx) {
    const results = [];
    for (const criterion of ctx.rubric.criteria) {
      if (!criterion.deterministic) continue;
      results.push(this._checkCriterion(criterion, ctx));
    }
    return results;
  }

  _checkCriterion(criterion, ctx) {
    const content = this._fullText(ctx.submission.content);

    if (criterion.id === "req-coverage") {
      return this._checkRequirementCoverage(criterion, content, ctx.problem.requirements);
    }

    // fallback — should not reach here for deterministic criteria
    return new CriterionResult({
      criterionId: criterion.id,
      score: 5,
      evidence: "Checked automatically.",
      concern: "Could not apply specific rule.",
      suggestion: "Review manually.",
      confidence: "low",
    });
  }

  /** Heuristic: how many requirements are mentioned in the submission text */
  _checkRequirementCoverage(criterion, content, requirements) {
    const lower = content.toLowerCase();
    const keywords = {
      "multiple floor":       ["floor", "multi-floor", "multifloor"],
      "vehicle type":         ["car", "bike", "truck", "vehicle type", "vehicletype"],
      "parking strategy":     ["strategy", "nearest", "random", "algorithm"],
      "ticket":               ["ticket", "payment", "fee", "receipt"],
      "state":                ["state", "status", "display"],
    };

    // For req-coverage, count how many requirements get a keyword hit
    let hits = 0;
    for (const req of requirements) {
      const reqLower = req.toLowerCase();
      const words = reqLower.split(/\W+/).filter(w => w.length > 3);
      if (words.some(w => lower.includes(w))) hits++;
    }

    const ratio = hits / requirements.length;
    const score = Math.round(ratio * 10);
    const covered = Math.round(ratio * 100);

    return new CriterionResult({
      criterionId: criterion.id,
      score,
      evidence: `${hits} of ${requirements.length} requirements appear to be addressed (${covered}% coverage).`,
      concern: ratio < 0.7 ? "Some requirements seem to be missing from the design." : "",
      suggestion: ratio < 0.7
        ? "Re-read the requirements list and make sure each one is addressed, even briefly."
        : "Good coverage — ensure each addressed requirement has a concrete class or method behind it.",
      confidence: "medium",
    });
  }

  _fullText(content) {
    return [content.design || "", content.code || ""].join("\n");
  }
}

// ─────────────────────────────────────────────
//  AIEvaluator
//  Calls Anthropic claude-sonnet-4-6 with a structured rubric prompt.
// ─────────────────────────────────────────────

const { GoogleGenAI } = require("@google/genai");

const AI_MODEL = "gemini-2.5-flash";
const AI_TIMEOUT = 30_000;

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    })
  : null;

class AIEvaluator {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async evaluate(ctx, criteriaToEvaluate) {
    const prompt = this._buildPrompt(ctx, criteriaToEvaluate);
    const raw    = await this._callAPI(prompt);
    return this._parseResponse(raw, criteriaToEvaluate);
  }

  _buildPrompt(ctx, criteria) {
    const criteriaBlock = criteria.map(c =>
      `- id: "${c.id}" | name: "${c.name}" | description: "${c.description}"`
    ).join("\n");

    const submissionBlock = [
      ctx.submission.content.design
        ? `## Design / Text\n${ctx.submission.content.design}`
        : "",
      ctx.submission.content.code
        ? `## Code\n${ctx.submission.content.code}`
        : "",
    ].filter(Boolean).join("\n\n");

    return `You are an expert software engineering coach evaluating a Low-Level Design (LLD) submission.

## Problem
${ctx.problem.title}: ${ctx.problem.statement}

## Requirements
${ctx.problem.requirements.map((r, i) => `${i + 1}. ${r}`).join("\n")}

## Candidate Submission
${submissionBlock}

## Your Task
Evaluate ONLY the following rubric criteria. For each criterion, return a JSON object.

Criteria to evaluate:
${criteriaBlock}

Return ONLY a valid JSON array (no markdown, no prose) in this exact shape:
[
  {
    "criterionId": "<id from above>",
    "score": <integer 0-10>,
    "evidence": "<1-2 sentences: what in the submission supports this score>",
    "concern": "<1 sentence: what is weak, missing, or risky — empty string if none>",
    "suggestion": "<1 concrete improvement the candidate can act on>",
    "confidence": "<high|medium|low>"
  },
  ...
]

Rules:
- Be specific — cite class names, patterns, or phrases from the submission as evidence.
- Score 8-10 means the criterion is well-met. 5-7 is partial. 0-4 is missing or wrong.
- Do not penalise for a valid design choice that differs from a reference solution.
- If the submission is empty or clearly incomplete, score 0 with confidence "high".`;
  }

async _callAPI(prompt) {
  if (!ai) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  try {
    const response = await ai.models.generateContent({
      model: AI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    });

    return response.text || "";

  } catch (error) {
    throw new Error(`Gemini API error: ${error.message}`);
  }
}
  _parseResponse(raw, criteria) {
    const clean = raw.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      // Fallback: return low-confidence results for all criteria
      return criteria.map(c => new CriterionResult({
        criterionId: c.id,
        score:      3,
        evidence:   "AI response could not be parsed.",
        concern:    "Evaluation reliability is low for this submission.",
        suggestion: "Try resubmitting or check the submission format.",
        confidence: "low",
      }));
    }

    return parsed.map(item => new CriterionResult({
      criterionId: item.criterionId,
      score:       Math.max(0, Math.min(10, Number(item.score) || 0)),
      evidence:    item.evidence   || "",
      concern:     item.concern    || "",
      suggestion:  item.suggestion || "",
      confidence:  ["high","medium","low"].includes(item.confidence) ? item.confidence : "medium",
    }));
  }
}

// ─────────────────────────────────────────────
//  HybridEvaluator — composes Deterministic + AI
// ─────────────────────────────────────────────

class HybridEvaluator {
  constructor(apiKey) {
    this.deterministic = new DeterministicEvaluator();
    this.ai            = new AIEvaluator(apiKey);
  }

  async evaluate(ctx) {
    // Step 1: deterministic checks (sync, fast)
    const deterministicResults = this.deterministic.evaluate(ctx);

    // Step 2: AI checks for non-deterministic criteria
    const aiCriteria = ctx.rubric.criteria.filter(c => !c.deterministic);
    let aiResults    = [];
    if (aiCriteria.length > 0) {
      aiResults = await this.ai.evaluate(ctx, aiCriteria);
    }

    const allResults = [...deterministicResults, ...aiResults];
    const overallScore = this._computeOverallScore(allResults, ctx.rubric);

    return new Evaluation({
      id:            randomUUID(),
      submissionId:  ctx.submission.id,
      problemId:     ctx.problem.id.value,
      results:       allResults,
      overallScore,
      summary:       this._buildSummary(overallScore, allResults),
      evaluatedAt:   new Date(),
      evaluatorType: "hybrid",
    });
  }

  _computeOverallScore(results, rubric) {
    let score = 0;
    for (const result of results) {
      const criterion = rubric.getCriterion(result.criterionId);
      if (criterion) score += (result.score / 10) * criterion.weight * 100;
    }
    return Math.round(score);
  }

  _buildSummary(score, results) {
    const concerns = results.filter(r => r.concern && r.concern.length > 0);
    if (score >= 80) return `Strong submission (${score}/100). ${concerns.length} minor concern(s) to review.`;
    if (score >= 60) return `Solid attempt (${score}/100) with room to improve in ${concerns.length} area(s).`;
    if (score >= 40) return `Partial submission (${score}/100). Several important design gaps identified.`;
    return `Early-stage submission (${score}/100). Focus on the core class responsibilities first.`;
  }
}

// ─────────────────────────────────────────────
//  EvaluatorFactory
//  Single place to construct an evaluator — easy to add new types.
// ─────────────────────────────────────────────

class EvaluatorFactory {
  static create(type, apiKey) {
    switch (type) {
      case "deterministic": return new DeterministicEvaluator();
      case "ai":            return new AIEvaluator(apiKey);
      case "hybrid":
      default:              return new HybridEvaluator(apiKey);
    }
  }
}

module.exports = {
  EvaluationContext,
  DeterministicEvaluator,
  AIEvaluator,
  HybridEvaluator,
  EvaluatorFactory,
};
