/**
 * exemplos/sqlite-basico/index.js
 *
 * Exemplo didático: SQLite com Node.js puro
 * Demonstra CRUD completo como alternativa ao arquivo JSON
 *
 * Instalação:
 *   npm install better-sqlite3
 *
 * Execução:
 *   node index.js
 */

const Database = require("better-sqlite3");
const path     = require("path");

// ── 1. Conecta (ou cria) o banco de dados ─────────────────────────────────
const db = new Database(path.join(__dirname, "erp.db"), {
  verbose: console.log, // loga cada SQL executado (remova em produção)
});

console.log("✅ Banco de dados conectado: erp.db\n");

// ── 2. Configurações de performance ───────────────────────────────────────
db.pragma("journal_mode = WAL");  // melhor performance em leituras simultâneas
db.pragma("foreign_keys = ON");   // garante integridade referencial

// ── 3. Cria tabelas (se não existirem) ────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS pedidos (
    id           TEXT    PRIMARY KEY,
    cliente      TEXT    NOT NULL,
    descricao    TEXT    NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'pendente',
    prioridade   TEXT    NOT NULL DEFAULT 'media',
    criado_em    TEXT    NOT NULL,
    atualizado_em TEXT   NOT NULL
  );

  CREATE TABLE IF NOT EXISTS logs (
    id           TEXT    PRIMARY KEY,
    pedido_id    TEXT    NOT NULL,
    acao         TEXT    NOT NULL,
    descricao    TEXT,
    timestamp    TEXT    NOT NULL,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  );
`);

console.log("✅ Tabelas criadas/verificadas\n");

// ── 4. Helpers ────────────────────────────────────────────────────────────
function gerarId(prefixo = "ID") {
  return `${prefixo}-${Date.now().toString(36).toUpperCase()}`;
}

function agora() {
  return new Date().toISOString();
}

// ── 5. CREATE — Inserir pedido ────────────────────────────────────────────
const stmtInserir = db.prepare(`
  INSERT INTO pedidos (id, cliente, descricao, status, prioridade, criado_em, atualizado_em)
  VALUES (@id, @cliente, @descricao, @status, @prioridade, @criado_em, @atualizado_em)
`);

function criarPedido({ cliente, descricao, prioridade = "media" }) {
  const pedido = {
    id:            gerarId("PED"),
    cliente,
    descricao,
    status:        "pendente",
    prioridade,
    criado_em:     agora(),
    atualizado_em: agora(),
  };

  stmtInserir.run(pedido);

  // Insere log de criação
  db.prepare(`
    INSERT INTO logs (id, pedido_id, acao, descricao, timestamp)
    VALUES (@id, @pedido_id, @acao, @descricao, @timestamp)
  `).run({
    id:        gerarId("LOG"),
    pedido_id: pedido.id,
    acao:      "criado",
    descricao: `Pedido criado por ${cliente}`,
    timestamp: agora(),
  });

  return pedido;
}

// ── 6. READ — Buscar todos ────────────────────────────────────────────────
const stmtListar = db.prepare("SELECT * FROM pedidos ORDER BY criado_em DESC");

function listarPedidos() {
  return stmtListar.all();
}

// ── 7. READ — Buscar por ID ───────────────────────────────────────────────
const stmtBuscar = db.prepare("SELECT * FROM pedidos WHERE id = ?");

function buscarPedido(id) {
  return stmtBuscar.get(id) || null;
}

// ── 8. READ — Filtrar por status ──────────────────────────────────────────
const stmtFiltrar = db.prepare("SELECT * FROM pedidos WHERE status = ? ORDER BY criado_em DESC");

function filtrarPorStatus(status) {
  return stmtFiltrar.all(status);
}

// ── 9. UPDATE — Atualizar status ──────────────────────────────────────────
const stmtAtualizar = db.prepare(`
  UPDATE pedidos
  SET status = @status, atualizado_em = @atualizado_em
  WHERE id = @id
`);

// Transação: atualiza pedido E insere log atomicamente
// Se qualquer parte falhar, tudo é revertido
const atualizarComLog = db.transaction((id, novoStatus) => {
  const pedido = buscarPedido(id);
  if (!pedido) throw new Error(`Pedido ${id} não encontrado`);

  stmtAtualizar.run({
    id,
    status:        novoStatus,
    atualizado_em: agora(),
  });

  db.prepare(`
    INSERT INTO logs (id, pedido_id, acao, descricao, timestamp)
    VALUES (@id, @pedido_id, @acao, @descricao, @timestamp)
  `).run({
    id:        gerarId("LOG"),
    pedido_id: id,
    acao:      "status_alterado",
    descricao: `Status alterado de '${pedido.status}' para '${novoStatus}'`,
    timestamp: agora(),
  });

  return buscarPedido(id); // retorna o pedido atualizado
});

// ── 10. DELETE — Remover pedido ───────────────────────────────────────────
const stmtDeletar = db.prepare("DELETE FROM pedidos WHERE id = ?");

function deletarPedido(id) {
  const resultado = stmtDeletar.run(id);
  return resultado.changes > 0; // true se deletou, false se não encontrou
}

// ── 11. READ — Buscar logs de um pedido ───────────────────────────────────
const stmtLogs = db.prepare("SELECT * FROM logs WHERE pedido_id = ? ORDER BY timestamp ASC");

function buscarLogs(pedidoId) {
  return stmtLogs.all(pedidoId);
}

// ── 12. Estatísticas (GROUP BY) ───────────────────────────────────────────
function estatisticas() {
  const total = db.prepare("SELECT COUNT(*) as total FROM pedidos").get();
  const porStatus = db.prepare(`
    SELECT status, COUNT(*) as quantidade
    FROM pedidos
    GROUP BY status
  `).all();

  return { total: total.total, porStatus };
}

// ── DEMONSTRAÇÃO ──────────────────────────────────────────────────────────
console.log("═".repeat(50));
console.log("  DEMONSTRAÇÃO DO CRUD COM SQLITE");
console.log("═".repeat(50));

// Criar pedidos
console.log("\n📌 Criando pedidos...");
const p1 = criarPedido({ cliente: "Empresa A",  descricao: "Compra de notebooks",  prioridade: "alta" });
const p2 = criarPedido({ cliente: "Empresa B",  descricao: "Suporte técnico mensal", prioridade: "media" });
const p3 = criarPedido({ cliente: "Startup XYZ", descricao: "Consultoria de TI",    prioridade: "baixa" });
console.log(`✅ ${p1.id} — ${p1.cliente}`);
console.log(`✅ ${p2.id} — ${p2.cliente}`);
console.log(`✅ ${p3.id} — ${p3.cliente}`);

// Listar todos
console.log("\n📋 Todos os pedidos:");
const todos = listarPedidos();
todos.forEach(p => console.log(`  ${p.id} | ${p.cliente} | ${p.status}`));

// Atualizar status com transação
console.log(`\n⚡ Atualizando status do pedido ${p1.id}...`);
const atualizado = atualizarComLog(p1.id, "em_andamento");
console.log(`✅ Novo status: ${atualizado.status}`);

// Ver logs
console.log(`\n📝 Logs do pedido ${p1.id}:`);
const logs = buscarLogs(p1.id);
logs.forEach(l => console.log(`  [${l.acao}] ${l.descricao}`));

// Filtrar por status
console.log("\n🔍 Pedidos com status 'pendente':");
const pendentes = filtrarPorStatus("pendente");
pendentes.forEach(p => console.log(`  ${p.id} — ${p.cliente}`));

// Estatísticas
console.log("\n📊 Estatísticas:");
const stats = estatisticas();
console.log(`  Total: ${stats.total} pedidos`);
stats.porStatus.forEach(s => console.log(`  ${s.status}: ${s.quantidade}`));

// Deletar
console.log(`\n🗑️  Deletando pedido ${p3.id}...`);
const deletou = deletarPedido(p3.id);
console.log(deletou ? "✅ Deletado com sucesso" : "❌ Não encontrado");

// Total final
const totalFinal = db.prepare("SELECT COUNT(*) as total FROM pedidos").get();
console.log(`\n📦 Total final no banco: ${totalFinal.total} pedidos`);

console.log("\n" + "═".repeat(50));
console.log("  FIM DA DEMONSTRAÇÃO");
console.log("═".repeat(50));

// ── Fecha conexão ao finalizar ────────────────────────────────────────────
process.on("exit", () => db.close());