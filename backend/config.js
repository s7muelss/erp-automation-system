/**
 * config.js — Fonte única de configuração
 * Lê variáveis de ambiente e expõe valores com defaults seguros
 */
const path = require("path");

const config = {
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: "0.0.0.0",
    env: process.env.NODE_ENV || "development",
  },
  cors: {
    origin: process.env.FRONTEND_ORIGIN || "*",
  },
  auth: {
    jwtSecret:   process.env.JWT_SECRET   || "dev-secret-TROQUE-em-producao",
    jwtExpiresIn: parseInt(process.env.JWT_EXPIRES_IN) || 86400, // 24h em segundos
    adminUser:   process.env.ADMIN_USER   || "admin",
    adminPassword: process.env.ADMIN_PASSWORD || "admin123",
  },
  data: {
    file: path.join(__dirname, "data", "pedidos.json"),
  },
};

// Aviso em produção se segredos não foram trocados
if (config.server.env === "production") {
  if (config.auth.jwtSecret === "dev-secret-TROQUE-em-producao") {
    console.warn("⚠️  AVISO: JWT_SECRET usando valor padrão em produção!");
  }
  if (config.auth.adminPassword === "admin123") {
    console.warn("⚠️  AVISO: ADMIN_PASSWORD usando valor padrão em produção!");
  }
}

module.exports = config;
