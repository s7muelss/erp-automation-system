# ⚙️ ERP Automation System

> Sistema web de gerenciamento de pedidos com workflow de status, autenticação JWT, exportação Excel e arquitetura profissional em camadas.

[![Frontend](https://img.shields.io/badge/Frontend-Vercel-black?logo=vercel)](https://erp-automation-system-eight.vercel.app)
[![Backend](https://img.shields.io/badge/Backend-Render-blue?logo=render)](https://erp-automation-system.onrender.com/api/health)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## 🌐 Demo em Produção

| Serviço | URL |
|---------|-----|
| **Frontend** | https://erp-automation-system-eight.vercel.app |
| **API Health** | https://erp-automation-system.onrender.com/api/health |

**Credenciais de acesso:** `admin` / `admin123`

> ⚠️ O backend roda no plano gratuito do Render — pode demorar até 50s para acordar no primeiro acesso do dia.

---

## 📋 Sobre o Projeto

O **ERP Automation System** é um sistema de gestão de pedidos empresariais desenvolvido do zero com **Node.js puro** (sem frameworks como Express), focado em demonstrar domínio de:

- Arquitetura de software em camadas
- Protocolo HTTP nativo
- Autenticação JWT implementada manualmente
- Deploy em infraestrutura real (Vercel + Render)
- UX profissional com SPA vanilla JavaScript

---

## ✨ Funcionalidades

- 🔐 **Autenticação JWT** — login seguro com token de sessão
- 📊 **Dashboard** — estatísticas em tempo real + gráfico de volume (7 dias)
- 📋 **Gestão de Pedidos** — criar, visualizar, filtrar por status e cliente
- ⚡ **Workflow de Status** — transições controladas: `Pendente → Em Andamento → Concluído`
- 📝 **Histórico de Logs** — rastreamento completo de todas as alterações
- 📦 **Itens por Pedido** — lista dinâmica com quantidade
- 📊 **Exportação Excel** — arquivo `.xlsx` formatado com cores por status
- 🔍 **Resumo ao Vivo** — painel lateral atualiza em tempo real ao preencher formulário
- 📱 **Responsivo** — funciona em desktop, tablet e mobile

---

## 🏗️ Arquitetura

### Visão Geral

```
┌─────────────────────┐         ┌──────────────────────────┐
│   Frontend (Vercel) │  HTTPS  │    Backend (Render)       │
│                     │ ──────► │                           │
│  HTML + CSS + JS    │  JWT    │   Node.js puro (sem       │
│  SPA Vanilla        │ ◄────── │   Express ou frameworks)  │
└─────────────────────┘         └──────────────────────────┘
```

### Estrutura do Backend

```
backend/
├── server.js                 # Inicialização do servidor HTTP
├── router.js                 # Tabela de rotas → controllers
├── config.js                 # Configuração centralizada (.env)
├── controllers/
│   ├── auth.controller.js    # Login / autenticação
│   ├── pedidos.controller.js # CRUD de pedidos + exportação
│   └── dashboard.controller.js # Métricas e estatísticas
├── services/
│   ├── auth.service.js       # Validação de credenciais + rate limiting
│   ├── jwt.service.js        # JWT HS256 implementado com crypto nativo
│   ├── pedidos.service.js    # Regras de negócio + workflow de status
│   └── dashboard.service.js  # Cálculo de métricas
├── repositories/
│   └── pedidos.repository.js # Acesso a dados + WriteQueue (anti race condition)
├── middlewares/
│   ├── auth.js               # Verificação JWT em rotas protegidas
│   ├── cors.js               # Headers CORS + segurança
│   ├── error.js              # Handler global de erros
│   └── logger.js             # Log de requisições
└── utils/
    └── http.js               # Helpers de request/response
```

### Endpoints da API

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `POST` | `/api/auth/login` | ❌ | Autenticação |
| `GET` | `/api/health` | ❌ | Status do servidor |
| `GET` | `/api/dashboard/stats` | ✅ | Métricas do dashboard |
| `GET` | `/api/pedidos` | ✅ | Listar pedidos |
| `POST` | `/api/pedidos` | ✅ | Criar pedido |
| `GET` | `/api/pedidos/:id` | ✅ | Buscar pedido |
| `PUT` | `/api/pedidos/:id` | ✅ | Atualizar pedido/status |
| `GET` | `/api/pedidos/:id/logs` | ✅ | Histórico de logs |
| `GET` | `/api/pedidos/export/csv` | ✅ | Exportar Excel |

### Workflow de Status

```
Pendente ──► Em Andamento ──► Concluído
    │                │
    └──────────────► Cancelado
```

---

## 🚀 Como Rodar Localmente

### Pré-requisitos
- Node.js 18+
- Git

### Backend

```bash
# Clone o repositório
git clone https://github.com/s7muelss/erp-automation-system.git
cd erp-automation-system/backend

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com seus valores

# Inicie o servidor
npm start
# ou em modo dev (auto-reload):
npm run dev
```

O backend estará em: `http://localhost:3000`

### Frontend

Abra o `frontend/index.html` com um servidor estático:

```bash
# Com VS Code: instale a extensão Live Server e clique em "Go Live"
# Ou com npx:
npx serve frontend
```

### Variáveis de Ambiente

Crie `backend/.env` baseado no `.env.example`:

```env
NODE_ENV=development
PORT=3000
FRONTEND_ORIGIN=http://localhost:5500
JWT_SECRET=sua-chave-secreta-aqui
JWT_EXPIRES_IN=86400
ADMIN_USER=admin
ADMIN_PASSWORD=sua-senha-aqui
```

---

## 🛠️ Tecnologias

### Backend
| Tecnologia | Uso |
|------------|-----|
| **Node.js 18+** | Runtime — servidor HTTP nativo sem frameworks |
| **crypto** (nativo) | JWT HS256 implementado do zero |
| **fs.promises** | Persistência assíncrona em JSON |
| **ExcelJS** | Geração de planilhas `.xlsx` formatadas |

### Frontend
| Tecnologia | Uso |
|------------|-----|
| **HTML5 + CSS3** | Estrutura e estilo |
| **JavaScript ES2022** | SPA sem frameworks |
| **CSS Grid + Flexbox** | Layout responsivo |
| **SVG Inline** | Ícones (Heroicons) |
| **Fetch API** | Comunicação com backend |

### Infraestrutura
| Serviço | Uso |
|---------|-----|
| **Vercel** | Deploy do frontend (CD automático via GitHub) |
| **Render** | Deploy do backend (CD automático via GitHub) |
| **GitHub** | Repositório + CI/CD trigger |

---

## 🔒 Segurança

- **JWT HS256** implementado com `crypto` nativo (sem bibliotecas externas)
- **Rate limiting** no login — bloqueia após 5 tentativas incorretas por 15 minutos
- **Sanitização de output** — prevenção de XSS em todo HTML gerado dinamicamente
- **CORS** configurado para aceitar apenas a origem do frontend
- **Payload limit** — requisições acima de 512kb são rejeitadas
- **Graceful shutdown** — servidor encerra conexões pendentes antes de desligar

---

## 🗄️ Banco de Dados — SQLite (Estudo e Próximo Passo)

A persistência atual do sistema usa um arquivo **JSON** (`data/pedidos.json`). Essa abordagem funciona bem para protótipos, mas tem limitações conhecidas em sistemas reais.

O repositório inclui em `exemplos/sqlite-basico/` um estudo completo de **SQLite** como evolução natural dessa camada.

### Por que SQLite?

| Critério | JSON File (atual) | SQLite (próximo passo) |
|----------|-------------------|------------------------|
| Race condition | ⚠️ Possível com requisições simultâneas | ✅ Transações ACID garantem integridade |
| Filtros e buscas | ❌ Lê o arquivo inteiro, filtra em memória | ✅ `WHERE`, `ORDER BY`, `GROUP BY` no banco |
| Performance | ❌ Degrada conforme o arquivo cresce | ✅ Índices e queries otimizadas |
| Relacionamentos | ❌ Dados aninhados em JSON | ✅ `FOREIGN KEY` entre tabelas |
| Transações | ❌ Não suportado | ✅ Commit/rollback nativo |
| Dependências | ✅ Zero | ⚠️ 1 pacote (`better-sqlite3`) |

### O que o exemplo cobre

O arquivo `exemplos/sqlite-basico/index.js` demonstra na prática:

**Básico:**
```sql
-- Criação de tabela
CREATE TABLE IF NOT EXISTS pedidos (
  id           TEXT PRIMARY KEY,
  cliente      TEXT NOT NULL,
  status       TEXT DEFAULT 'pendente',
  criado_em    TEXT NOT NULL
);

-- Inserção
INSERT INTO pedidos (id, cliente, status, criado_em)
VALUES ('PED-001', 'Empresa A', 'pendente', '2026-04-23');

-- Leitura
SELECT * FROM pedidos ORDER BY criado_em DESC;

-- Atualização
UPDATE pedidos SET status = 'concluido' WHERE id = 'PED-001';

-- Remoção
DELETE FROM pedidos WHERE id = 'PED-001';
```

**Intermediário:**
```sql
-- Filtros
SELECT * FROM pedidos WHERE status = 'pendente';

-- Agrupamento e contagem
SELECT status, COUNT(*) as quantidade
FROM pedidos
GROUP BY status;

-- Chave estrangeira (logs vinculados ao pedido)
CREATE TABLE logs (
  id        TEXT PRIMARY KEY,
  pedido_id TEXT NOT NULL,
  acao      TEXT NOT NULL,
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
);
```

**Conceito avançado — Transações:**
```javascript
// Atualiza pedido E insere log ao mesmo tempo
// Se qualquer parte falhar, TUDO é revertido (rollback automático)
const operacao = db.transaction((id, novoStatus) => {
  db.prepare("UPDATE pedidos SET status = ? WHERE id = ?").run(novoStatus, id);
  db.prepare("INSERT INTO logs (pedido_id, acao) VALUES (?, ?)").run(id, "status_alterado");
});

operacao("PED-001", "concluido"); // atômico — ou tudo funciona, ou nada muda
```

### Como rodar o exemplo

```bash
cd exemplos/sqlite-basico
npm install
npm start
```

O script cria o banco, executa todas as operações e exibe o resultado no terminal — sem precisar de nenhum servidor ou configuração adicional.

---

## 📈 Próximas Melhorias

- [ ] Migrar persistência de JSON para SQLite
- [ ] Refresh token (access token curto + refresh token longo)
- [ ] Testes automatizados com Node.js `assert` nativo
- [ ] Notificações por webhook ao mudar status
- [ ] Campo de prazo com alertas de atraso

---

## 👨‍💻 Autor

**Samuel** — Desenvolvedor em formação, focado em sistemas e automação de processos.

[![GitHub](https://img.shields.io/badge/GitHub-s7muelss-black?logo=github)](https://github.com/s7muelss)