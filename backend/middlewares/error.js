function errorHandler(res, err, context = "") {
  const isProd = process.env.NODE_ENV === "production";

  console.error(`[ERROR]${context ? " " + context : ""}:`, err.message || err);

  const body = JSON.stringify({
    erro:      true,
    mensagem:  isProd ? "Erro interno do servidor" : (err.message || "Erro desconhecido"),
    ...(isProd ? {} : { stack: err.stack }),
    timestamp: new Date().toISOString(),
  });

  if (!res.headersSent) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
  }
}

module.exports = errorHandler;
