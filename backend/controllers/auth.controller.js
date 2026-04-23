const authService = require("../services/auth.service");
const { parseBody, sendJSON, sendError } = require("../utils/http");

async function login(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendError(res, 400, err.message);
  }

  const { username, password } = body;

  if (!username || !password) {
    return sendError(res, 400, "Campos 'username' e 'password' são obrigatórios");
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress || "unknown";

  try {
    const result = authService.login(username, password, ip);
    sendJSON(res, 200, result);
  } catch (err) {
    sendError(res, err.status || 401, err.message);
  }
}

module.exports = { login };

