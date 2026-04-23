const config = require("../config");

function corsMiddleware(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  config.cors.origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age",       "86400");

  // Segurança básica
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options",        "DENY");
}

module.exports = corsMiddleware;

