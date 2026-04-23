const jwtService = require("./jwt.service");
const config     = require("../config");

const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 15 * 60 * 1000; // 15 minutos

// Mapa simples em memória para rate limiting de login (reinicia com o servidor)
const loginAttempts = new Map(); // ip → { count, firstAt }

function isLockedOut(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > LOCKOUT_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordAttempt(ip) {
  const entry = loginAttempts.get(ip) || { count: 0, firstAt: Date.now() };
  entry.count += 1;
  loginAttempts.set(ip, entry);
}

function clearAttempts(ip) {
  loginAttempts.delete(ip);
}

/**
 * Valida credenciais e retorna um JWT assinado.
 * @returns {{ token: string, expiresIn: number, user: string }}
 */
function login(username, password, ip = "unknown") {
  if (isLockedOut(ip)) {
    throw Object.assign(
      new Error("Muitas tentativas incorretas. Tente novamente em 15 minutos."),
      { status: 429 }
    );
  }

  const validUser = config.auth.adminUser;
  const validPass = config.auth.adminPassword;

  if (username !== validUser || password !== validPass) {
    recordAttempt(ip);
    throw Object.assign(
      new Error("Credenciais inválidas"),
      { status: 401 }
    );
  }

  clearAttempts(ip);

  const token = jwtService.sign({ sub: username, role: "admin" });

  return {
    token,
    expiresIn: config.auth.jwtExpiresIn,
    user: username,
  };
}

module.exports = { login };
