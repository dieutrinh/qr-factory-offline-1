const express = require("express");
const path = require("path");

async function startServer({ port = 0 } = {}) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // Serve UI
  const wwwDir = path.join(__dirname, "www");
  app.use("/", express.static(wwwDir));

  // Health + base-url
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  // base-url sẽ set ở main.js theo port thực tế

  // (TẠM) API create để bạn test nút không chết
  app.post("/api/create", (req, res) => {
    // Bạn có thể nối DB thật sau. Ở đây chỉ đảm bảo nút chạy.
    const body = req.body || {};
    const code = body.code || ("QR" + Math.random().toString(36).slice(2, 10).toUpperCase());
    res.json({ ok: true, code });
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, "127.0.0.1", () => {
      const realPort = server.address().port;
      resolve({ app, server, port: realPort });
    });
    server.on("error", reject);
  });
}

module.exports = { startServer };

// Cho phép chạy trực tiếp: node server.js
if (require.main === module) {
  startServer({ port: process.env.PORT ? Number(process.env.PORT) : 3000 })
    .then(({ port }) => console.log("Server listening on", port))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
