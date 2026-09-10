/**
 * Seed data: LLD problems with rubrics
 *
 * Each problem has a Rubric whose criteria weights sum to 1.0
 * Deterministic criteria can be checked with simple rules;
 * non-deterministic criteria need AI judgment.
 */

const {
  Problem, Rubric, RubricCriterion,
  Difficulty, Category,
} = require("../domain/models");

function buildRubric(criteria) {
  return new Rubric(criteria.map(c => new RubricCriterion(c)));
}

const PROBLEMS = [
  new Problem({
    id: "parking-lot",
    title: "Parking Lot System",
    difficulty: Difficulty.MEDIUM,
    category: Category.OOP,
    statement: `Design a parking lot system that can park different types of vehicles 
(car, bike, truck) in a multi-floor parking lot. The system should support 
parking, removing, and locating a vehicle, and handle different parking strategies.`,
    requirements: [
      "Support multiple floors.",
      "Support different vehicle types (car, bike, truck).",
      "Find and assign the nearest available spot.",
      "Support parking strategies (e.g., nearest-first, random).",
      "Display parking lot state.",
      "Generate a ticket on parking and handle payment on exit.",
    ],
    constraints: [
      "The parking lot can have multiple floors.",
      "Each floor can have multiple spots.",
      "A vehicle can take one or more spots based on its size.",
      "Keep the design modular and extensible.",
    ],
    hints: [
      "Object-Oriented Design",
      "Strategy Pattern (parking strategy)",
      "Factory Pattern (spot/vehicle creation)",
      "Data Structures for spot lookup",
      "UML Class Diagrams",
    ],
    rubric: buildRubric([
      { id: "req-coverage",  name: "Requirement Coverage",    description: "All listed requirements are addressed.", weight: 0.15, deterministic: true },
      { id: "class-resp",    name: "Class Responsibilities",   description: "Each class has a single, clear responsibility; no god classes.", weight: 0.20, deterministic: false },
      { id: "abstraction",   name: "Abstraction & Interfaces", description: "Interfaces/abstract classes hide implementation details correctly.", weight: 0.15, deterministic: false },
      { id: "coupling",      name: "Coupling & Cohesion",      description: "Low coupling between classes; high cohesion within.", weight: 0.15, deterministic: false },
      { id: "extensibility", name: "Extensibility",            description: "Adding a new vehicle type or strategy requires minimal change.", weight: 0.15, deterministic: false },
      { id: "edge-cases",    name: "Edge Cases",               description: "Handles full lot, unknown vehicle, concurrent access consideration.", weight: 0.10, deterministic: false },
      { id: "explanation",   name: "Quality of Explanation",   description: "Assumptions stated, trade-offs discussed, reasoning clear.", weight: 0.10, deterministic: false },
    ]),
    createdAt: new Date("2024-01-01"),
  }),

  new Problem({
    id: "elevator-system",
    title: "Elevator System",
    difficulty: Difficulty.MEDIUM,
    category: Category.OOP,
    statement: `Design an elevator system for a building with multiple elevators. 
The system should handle requests efficiently, manage elevator state, 
and dispatch the right elevator to serve each floor request.`,
    requirements: [
      "Multiple elevators, multiple floors.",
      "Handle UP and DOWN floor requests.",
      "Dispatch algorithm (e.g., nearest elevator, SCAN/LOOK).",
      "Track elevator state: IDLE, MOVING_UP, MOVING_DOWN, DOOR_OPEN.",
      "Queue and reorder stops efficiently.",
      "Handle edge cases: overload, door malfunction.",
    ],
    constraints: [
      "Elevators should not be sent redundantly to the same floor.",
      "Must avoid starvation of high/low floor requests.",
      "Design must allow swapping the dispatch algorithm.",
    ],
    hints: [
      "State Machine for elevator state",
      "Strategy Pattern for dispatch algorithm",
      "Observer/Event pattern for floor button presses",
      "Priority Queue for stop management",
    ],
    rubric: buildRubric([
      { id: "req-coverage",  name: "Requirement Coverage",    description: "All listed requirements addressed.", weight: 0.15, deterministic: true },
      { id: "state-machine", name: "State Machine Design",    description: "Elevator states and transitions are correctly modelled.", weight: 0.20, deterministic: false },
      { id: "dispatch",      name: "Dispatch Algorithm",      description: "Dispatch strategy is correct and swappable.", weight: 0.15, deterministic: false },
      { id: "class-resp",    name: "Class Responsibilities",  description: "Clear separation: Controller, Elevator, Request, etc.", weight: 0.15, deterministic: false },
      { id: "extensibility", name: "Extensibility",           description: "Swap dispatch algorithm or add a new state without major rework.", weight: 0.15, deterministic: false },
      { id: "edge-cases",    name: "Edge Cases",              description: "Overload, simultaneous requests, starvation addressed.", weight: 0.10, deterministic: false },
      { id: "explanation",   name: "Quality of Explanation",  description: "Assumptions, trade-offs, and design rationale are clear.", weight: 0.10, deterministic: false },
    ]),
    createdAt: new Date("2024-01-02"),
  }),

  new Problem({
    id: "rate-limiter",
    title: "Rate Limiter",
    difficulty: Difficulty.MEDIUM,
    category: Category.PATTERNS,
    statement: `Design a rate limiter that can be used to throttle API requests. 
The system should support multiple rate-limiting algorithms and be 
configurable per API key or user.`,
    requirements: [
      "Support at least two algorithms: Token Bucket and Sliding Window.",
      "Per-user or per-API-key limits.",
      "Thread-safe: handle concurrent requests correctly.",
      "Allow algorithm to be chosen at configuration time.",
      "Return remaining quota in the response.",
    ],
    constraints: [
      "Must not allow a burst beyond the configured limit.",
      "Should handle clock skew gracefully.",
      "Algorithm must be swappable without changing the public interface.",
    ],
    hints: [
      "Strategy Pattern for algorithms",
      "Decorator Pattern for composing limiters",
      "Concurrent data structures",
      "Time-based sliding window",
    ],
    rubric: buildRubric([
      { id: "req-coverage",   name: "Requirement Coverage",   description: "Both algorithms and per-key limits addressed.", weight: 0.15, deterministic: true },
      { id: "algorithm",      name: "Algorithm Correctness",  description: "Token bucket / sliding window logic is sound.", weight: 0.20, deterministic: false },
      { id: "thread-safety",  name: "Thread Safety",          description: "Concurrent access handled without race conditions.", weight: 0.20, deterministic: false },
      { id: "abstraction",    name: "Abstraction Quality",    description: "Interface hides algorithm; caller unaffected by swap.", weight: 0.15, deterministic: false },
      { id: "extensibility",  name: "Extensibility",          description: "Adding a third algorithm requires no interface change.", weight: 0.15, deterministic: false },
      { id: "edge-cases",     name: "Edge Cases",             description: "Clock skew, burst at boundary, zero limit handled.", weight: 0.15, deterministic: false },
    ]),
    createdAt: new Date("2024-01-03"),
  }),

  new Problem({
    id: "vending-machine",
    title: "Vending Machine",
    difficulty: Difficulty.EASY,
    category: Category.PATTERNS,
    statement: `Design a vending machine that sells multiple products. 
The machine should handle coin insertion, product selection, 
dispensing, and change return.`,
    requirements: [
      "Accept multiple coin denominations.",
      "Display available products and prices.",
      "Dispense product if sufficient balance and product available.",
      "Return change after dispensing.",
      "Handle insufficient funds and out-of-stock gracefully.",
      "Admin can restock products and collect cash.",
    ],
    constraints: [
      "Machine must never dispense without collecting correct payment.",
      "Design must handle state transitions clearly (IDLE → COIN_INSERTED → DISPENSING → CHANGE).",
      "Keep the state machine explicit.",
    ],
    hints: [
      "State Pattern for machine states",
      "Command Pattern for actions",
      "Inventory management",
      "Coin change algorithm",
    ],
    rubric: buildRubric([
      { id: "req-coverage",  name: "Requirement Coverage",   description: "All requirements including restock/collect addressed.", weight: 0.15, deterministic: true },
      { id: "state-machine", name: "State Machine Design",   description: "State transitions are complete and correct.", weight: 0.25, deterministic: false },
      { id: "class-resp",    name: "Class Responsibilities",  description: "Inventory, Payment, Dispenser are separate concerns.", weight: 0.20, deterministic: false },
      { id: "edge-cases",    name: "Edge Cases",              description: "Exact change, overpayment, empty slot, invalid coin.", weight: 0.20, deterministic: false },
      { id: "extensibility", name: "Extensibility",           description: "Adding a new coin type or product category is easy.", weight: 0.10, deterministic: false },
      { id: "explanation",   name: "Quality of Explanation",  description: "Assumptions and trade-offs are clear.", weight: 0.10, deterministic: false },
    ]),
    createdAt: new Date("2024-01-04"),
  }),

  new Problem({
    id: "file-system",
    title: "In-Memory File System",
    difficulty: Difficulty.HARD,
    category: Category.OOP,
    statement: `Design an in-memory file system that supports basic file and 
directory operations. The system should handle nested directories, 
file content, and path-based navigation.`,
    requirements: [
      "Create and delete files and directories.",
      "Read and write file content.",
      "List directory contents.",
      "Navigate with absolute and relative paths.",
      "Support move and copy operations.",
      "Handle permissions (read, write, execute).",
    ],
    constraints: [
      "Paths use Unix-style separators.",
      "The root directory is '/'.",
      "File and directory names are case-sensitive.",
      "Design should mirror real FS abstractions.",
    ],
    hints: [
      "Composite Pattern (File and Directory as nodes)",
      "Tree data structure",
      "Visitor Pattern for traversal",
      "Path parsing utilities",
    ],
    rubric: buildRubric([
      { id: "req-coverage",  name: "Requirement Coverage",    description: "All operations including permissions addressed.", weight: 0.15, deterministic: true },
      { id: "composite",     name: "Composite Pattern Usage", description: "File and Directory share a common interface correctly.", weight: 0.20, deterministic: false },
      { id: "class-resp",    name: "Class Responsibilities",  description: "Path resolver, node, permissions are separate concerns.", weight: 0.15, deterministic: false },
      { id: "edge-cases",    name: "Edge Cases",              description: "Non-existent path, permission denied, circular links.", weight: 0.20, deterministic: false },
      { id: "abstraction",   name: "Abstraction Quality",     description: "Caller code is the same whether accessing a file or dir.", weight: 0.15, deterministic: false },
      { id: "extensibility", name: "Extensibility",           description: "Adding symlinks or a new node type requires minimal change.", weight: 0.15, deterministic: false },
    ]),
    createdAt: new Date("2024-01-05"),
  }),
];

module.exports = { PROBLEMS };
