/**
 * utils/http.js — Helpers para trabalhar com req/res do Node http nativo
 */

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    "Content-Type":   "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, statusCode, message, details = null) {
  sendJSON(res, statusCode, {
    erro:      true,
    mensagem:  message,
    ...(details ? { detalhes: details } : {}),
    timestamp: new Date().toISOString(),
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
      if (body.length > 512_000) { // 512kb limit
        req.destroy();
        reject(new Error("Payload excede o limite permitido"));
      }
    });

    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Corpo da requisição com JSON inválido"));
      }
    });

    req.on("error", reject);
  });
}

module.exports = { sendJSON, sendError, parseBody };

