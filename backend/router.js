/**
 * router.js — Mapeamento de rotas para controllers
 *
 * Cada rota define:
 *   - method: verbo HTTP
 *   - pattern: string ou regex para match do pathname
 *   - handler: função do controller
 *   - auth: se true, exige JWT válido
 *
 * Parâmetros de URL são extraídos via named groups do regex.
 */
const { URL }     = require("url");
const corsMiddleware = require("./middlewares/cors");
const authMiddleware = require("./middlewares/auth");
const loggerMiddleware = require("./middlewares/logger");
const errorHandler   = require("./middlewares/error");
const { sendJSON, sendError } = require("./utils/http");

const authCtrl      = require("./controllers/auth.controller");
const pedidosCtrl   = require("./controllers/pedidos.controller");
const dashboardCtrl = require("./controllers/dashboard.controller");

// ── Tabela de rotas ───────────────────────────────────────────────────────────
const routes = [
  // Público
  { method: "GET",  path: /^\/api\/health$/,                  handler: handleHealth,                auth: false },
  { method: "POST", path: /^\/api\/auth\/login$/,             handler: authCtrl.login,              auth: false },

  // Dashboard (protegido)
  { method: "GET",  path: /^\/api\/dashboard\/stats$/,        handler: dashboardCtrl.getStats,      auth: true },

  // Pedidos (protegidos)
  { method: "GET",  path: /^\/api\/pedidos$/,                 handler: pedidosCtrl.listar,          auth: true },
  { method: "POST", path: /^\/api\/pedidos$/,                 handler: pedidosCtrl.criar,           auth: true },
  { method: "GET",  path: /^\/api\/pedidos\/export\/csv$/,    handler: pedidosCtrl.exportarCSV,     auth: true },
  { method: "GET",  path: /^\/api\/pedidos\/(?<id>[^/]+)$/,   handler: pedidosCtrl.buscarPorId,     auth: true },
  { method: "PUT",  path: /^\/api\/pedidos\/(?<id>[^/]+)$/,   handler: pedidosCtrl.atualizar,       auth: true },
  { method: "GET",  path: /^\/api\/pedidos\/(?<id>[^/]+)\/logs$/, handler: pedidosCtrl.buscarLogs,  auth: true },
];

// ── Dispatcher principal ──────────────────────────────────────────────────────
async function dispatch(req, res) {
  const startTime = Date.now();

  // CORS em toda resposta
  corsMiddleware(req, res);

  // Preflight OPTIONS
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch {
    return sendError(res, 400, "URL malformada");
  }

  const pathname = parsedUrl.pathname.replace(/\/$/, "") || "/";

  // Só loga rotas /api
  if (pathname.startsWith("/api")) {
    loggerMiddleware(req, startTime);
  }

  // Encontra rota compatível
  for (const route of routes) {
    if (req.method !== route.method) continue;

    const match = pathname.match(route.path);
    if (!match) continue;

    // Verifica autenticação se necessário
    if (route.auth) {
      const authResult = authMiddleware(req, res);
      if (!authResult.ok) {
        return sendError(res, authResult.status, authResult.message);
      }
    }

    // Parâmetros de URL (ex: id)
    const params = { ...match.groups, searchParams: parsedUrl.searchParams };

    try {
      await route.handler(req, res, params);
    } catch (err) {
      errorHandler(res, err, `${req.method} ${pathname}`);
    }
    return;
  }

  // Nenhuma rota de API bateu
  if (pathname.startsWith("/api")) {
    return sendError(res, 404, `Rota não encontrada: ${req.method} ${pathname}`);
  }

  // Rotas não-API → resposta informativa (frontend está no Vercel)
  sendJSON(res, 200, {
    service:   "ERP Automation System — API",
    version:   "2.0.0",
    status:    "online",
    endpoints: {
      health:  "GET /api/health",
      login:   "POST /api/auth/login",
      pedidos: "GET /api/pedidos",
      stats:   "GET /api/dashboard/stats",
    },
    frontend: "https://erp-automation-system-eight.vercel.app",
  });
}

function handleHealth(req, res) {
  sendJSON(res, 200, {
    status:    "ok",
    service:   "ERP Automation System",
    version:   "2.0.0",
    uptime:    Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV || "development",
  });
}

module.exports = { dispatch };

