const jwtService = require("../services/jwt.service");

/**
 * Middleware de autenticação JWT.
 * Extrai o token do header Authorization: Bearer <token>
 * e injeta o payload decodificado em req.user.
 * Retorna 401 se ausente ou inválido.
 */
function authMiddleware(req, res) {
  const authHeader = req.headers["authorization"] || "";

  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Token de autenticação não fornecido" };
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwtService.verify(token);
    req.user = payload;
    return { ok: true };
  } catch (err) {
    return { ok: false, status: 401, message: err.message };
  }
}

module.exports = authMiddleware;
