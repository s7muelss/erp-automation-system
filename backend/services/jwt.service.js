/**
 * jwt.service.js — Implementação JWT HS256 usando apenas crypto nativo do Node.js
 * Zero dependências externas.
 */
const crypto = require("crypto");
const config = require("../config");

function base64urlEncode(input) {
  const str = typeof input === "string" ? input : JSON.stringify(input);
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecode(input) {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function sign(payload) {
  const secret    = config.auth.jwtSecret;
  const expiresIn = config.auth.jwtExpiresIn;
  const now       = Math.floor(Date.now() / 1000);

  const header  = base64urlEncode({ alg: "HS256", typ: "JWT" });
  const body    = base64urlEncode({ ...payload, iat: now, exp: now + expiresIn });
  const sigInput = `${header}.${body}`;

  const signature = crypto
    .createHmac("sha256", secret)
    .update(sigInput)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${header}.${body}.${signature}`;
}

function verify(token) {
  if (!token || typeof token !== "string") {
    throw new Error("Token inválido");
  }

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Formato de token inválido");

  const [header, body, signature] = parts;
  const secret = config.auth.jwtSecret;

  // Verifica assinatura
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  // Comparação segura (evita timing attacks)
  const sigBuffer      = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw new Error("Assinatura do token inválida");
  }

  // Decodifica e verifica expiração
  const payload = JSON.parse(base64urlDecode(body));

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expirado");
  }

  return payload;
}

module.exports = { sign, verify };
