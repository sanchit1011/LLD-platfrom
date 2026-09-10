const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;

const server = http.createServer((req, res) => {

    // ================================
    // API: Get all problems
    // ================================
    if (req.method === "GET" && req.url === "/api/problems") {

        const problems = [
            {
                id: "parking-lot",
                title: "Parking Lot",
                difficulty: "medium",
                category: "oop",
                statement:
                    "Design a parking lot system that supports multiple floors, vehicle types, and parking strategies."
            },
            {
                id: "elevator-system",
                title: "Elevator System",
                difficulty: "medium",
                category: "oop",
                statement:
                    "Design an elevator system that can efficiently handle multiple requests."
            },
            {
                id: "rate-limiter",
                title: "Rate Limiter",
                difficulty: "medium",
                category: "concurrency",
                statement:
                    "Design a rate limiter that controls API requests."
            },
            {
                id: "vending-machine",
                title: "Vending Machine",
                difficulty: "easy",
                category: "patterns",
                statement:
                    "Design a vending machine that supports products, payments, and change."
            },
            {
                id: "file-system",
                title: "File System",
                difficulty: "medium",
                category: "patterns",
                statement:
                    "Design an in-memory file system with basic file and directory operations."
            }
        ];

        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify(problems));

        return;
    }


    // ================================
    // FRONTEND: Serve files
    // ================================

    let filePath = path.join(
        __dirname,
        "..",
        "public",
        req.url === "/" ? "index.html" : req.url
    );

    if (!fs.existsSync(filePath)) {
        res.writeHead(404, {
            "Content-Type": "text/plain"
        });

        res.end("Not Found");
        return;
    }

    const ext = path.extname(filePath);

    const contentTypes = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript"
    };

    res.writeHead(200, {
        "Content-Type": contentTypes[ext] || "text/plain"
    });

    res.end(fs.readFileSync(filePath));
});

server.listen(PORT, () => {
    console.log(`LLD Practice running at http://localhost:${PORT}`);
});