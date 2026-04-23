/**
 * server.js — Ponto de entrada do servidor
 *
 * Responsabilidade ÚNICA: criar o servidor HTTP, vincular o router,
 * inicializar dependências e gerenciar lifecycle (startup/shutdown).
 *
 * Sem lógica de negócio, sem rotas, sem acesso a dados aqui.
 */
const http   = require("http");
const config = require("./config");
const router = require("./router");
const repo   = require("./repositories/pedidos.repository");

// ── Inicialização ─────────────────────────────────────────────────────────────
repo.init();

const server = http.createServer(router.dispatch);

server.listen(config.server.port, config.server.host, () => {
  console.log("─".repeat(52));
  console.log("  🚀 ERP Automation System v2.0");
  console.log(`  📡 http://${config.server.host}:${config.server.port}`);
  console.log(`  🌍 Env: ${config.server.env}`);
  console.log(`  🔒 CORS: ${config.cors.origin}`);
  console.log("─".repeat(52));
  console.log("  Rotas:");
  console.log("  POST /api/auth/login");
  console.log("  GET  /api/health");
  console.log("  GET  /api/dashboard/stats       [JWT]");
  console.log("  GET  /api/pedidos               [JWT]");
  console.log("  POST /api/pedidos               [JWT]");
  console.log("  GET  /api/pedidos/:id           [JWT]");
  console.log("  PUT  /api/pedidos/:id           [JWT]");
  console.log("  GET  /api/pedidos/:id/logs      [JWT]");
  console.log("  GET  /api/pedidos/export/csv    [JWT]");
  console.log("─".repeat(52));
});

server.on("error", err => {
  console.error("❌ Erro fatal:", err.message);
  if (err.code === "EADDRINUSE") {
    console.error(`   Porta ${config.server.port} já está em uso`);
  }
  process.exit(1);
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n🛑 ${signal} — encerrando servidor...`);
  server.close(() => {
    console.log("✅ Servidor encerrado.");
    process.exit(0);
  });

  // Força saída após 10s se pendente
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// Captura exceções não tratadas sem derrubar o servidor
process.on("uncaughtException", err => {
  console.error("⚠️  Exceção não tratada:", err.message, err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error("⚠️  Promise rejeitada não tratada:", reason);
});

module.exports = server;

