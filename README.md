# ERP Automation System

## 🔍 Diagnóstico dos Problemas (e Correções Aplicadas)

### Problema 1 — Render retorna 404 na raiz "/"
**Causa raiz:** O servidor Node puro não tinha handler para `/`.  
Qualquer requisição que não batesse explicitamente em `/pedidos` caia em erro.

**Correção:** Adicionado roteamento completo:
- Rotas de API sob `/api/*`
- Fallback estático com `serveStatic()` para todo o resto
- Fallback SPA: serve `index.html` para qualquer rota desconhecida

---

### Problema 2 — `HOST = 'localhost'` no Render
**Causa raiz:** `server.listen(PORT, 'localhost')` no Render significa que o servidor só
escuta em loopback interno — o proxy externo do Render não consegue alcançar o processo.

**Correção:**
```js
// ❌ ERRADO
server.listen(PORT, 'localhost', ...)

// ✅ CORRETO
const HOST = '0.0.0.0';
server.listen(PORT, HOST, ...)
```

---

### Problema 3 — PORT hardcoded
**Causa raiz:** Render injeta `process.env.PORT` dinamicamente. Se o código usa porta
fixa (ex: 3000), o servidor sobe em porta errada e o Render não consegue fazer proxy.

**Correção:**
```js
const PORT = process.env.PORT || 3000;
```

---

### Problema 4 — Paths com `__dirname` quebrando no Render
**Causa raiz:** Caminhos relativos como `./data/pedidos.json` funcionam em dev mas
quebram quando o working directory muda no Render.

**Correção:** Usar sempre `path.join(__dirname, ...)`:
```js
const DATA_FILE = path.join(__dirname, 'data', 'pedidos.json');
```

---

### Problema 5 — Falta de CORS
**Causa raiz:** Sem headers CORS, o browser bloqueia requisições do Vercel para o Render.

**Correção:** Headers adicionados em **toda** resposta, incluindo preflight OPTIONS:
```js
res.setHeader('Access-Control-Allow-Origin', FRONTEND_ORIGIN);
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
```

---

### Problema 6 — rootDir incorreto no Render
**Causa raiz:** Se o `rootDir` no dashboard do Render aponta para a raiz do repositório
mas o `package.json` está em `backend/`, o `startCommand: node server.js` falha.

**Correção:** `render.yaml` com `rootDir: backend`.

---

### Problema 7 — URL da API hardcoded no frontend
**Causa raiz:** URL de API usando `localhost` em produção ou URL errada do Render.

**Correção:** Detecção automática de ambiente no `app.js`:
- Vercel → aponta para `https://erp-automation-system.onrender.com/api`
- Mesmo servidor → usa `window.location.origin + /api`
- Localhost → `http://localhost:3000/api`

---

## 📁 Estrutura do Projeto

```
erp-automation-system/
├── render.yaml              ← config automática do Render
├── .gitignore
├── backend/
│   ├── server.js            ← servidor Node puro (CORRIGIDO)
│   ├── package.json         ← scripts corretos
│   └── data/
│       └── pedidos.json     ← criado automaticamente
└── frontend/
    ├── index.html
    ├── app.js
    ├── style.css
    └── vercel.json          ← config SPA do Vercel
```

---

## 🚀 Deploy — Passo a Passo

### Backend no Render

1. Acesse [render.com](https://render.com) → "New Web Service"
2. Conecte seu repositório GitHub
3. Configure:
   - **Name:** `erp-automation-system`
   - **Root Directory:** `backend`  ← **CRÍTICO**
   - **Build Command:** _(deixar em branco ou `echo ok`)_
   - **Start Command:** `node server.js`
   - **Environment:** Node
4. Em "Environment Variables", adicione:
   - `NODE_ENV` = `production`
   - `FRONTEND_ORIGIN` = `https://seu-projeto.vercel.app`
5. Clique em "Create Web Service"
6. Aguarde o deploy e acesse: `https://erp-automation-system.onrender.com/api/health`

> **Alternativa:** Use o `render.yaml` na raiz do repo para configuração automática.

---

### Frontend no Vercel

1. Acesse [vercel.com](https://vercel.com) → "New Project"
2. Conecte o repositório
3. Configure:
   - **Root Directory:** `frontend`  ← **CRÍTICO**
   - **Framework Preset:** Other
   - Build/Output: _(deixar padrão)_
4. Deploy → Vercel detecta `vercel.json` automaticamente

---

### Atualizar URL da API no Frontend

Se a URL do seu Render for diferente, edite `frontend/app.js`:
```js
// Linha ~10 — troque pela sua URL real:
return "https://SEU-PROJETO.onrender.com/api";
```

Ou injete via variável de ambiente no Vercel:
1. Vercel → Settings → Environment Variables
2. Adicione: `NEXT_PUBLIC_API_URL` = `https://seu.onrender.com/api`
3. No `index.html`, antes de carregar `app.js`:
   ```html
   <script>window.ENV_API_URL = "https://seu.onrender.com/api";</script>
   ```

---

## 🔗 Endpoints da API

| Método | Rota                     | Descrição                        |
|--------|--------------------------|----------------------------------|
| GET    | `/api/health`            | Health check (monitoramento)     |
| GET    | `/api/pedidos`           | Lista pedidos (filtros opcionais)|
| POST   | `/api/pedidos`           | Cria novo pedido                 |
| GET    | `/api/pedidos/:id`       | Busca pedido por ID              |
| PUT    | `/api/pedidos/:id`       | Atualiza pedido / status         |
| GET    | `/api/pedidos/:id/logs`  | Histórico de logs do pedido      |

### Filtros disponíveis (GET /api/pedidos):
- `?status=pendente|em_andamento|concluido|cancelado`
- `?cliente=nome`

### Workflow de Status:
```
pendente → em_andamento → concluido
pendente → cancelado
em_andamento → cancelado
```

---

## 🧪 Teste rápido da API

```bash
# Health check
curl https://erp-automation-system.onrender.com/api/health

# Criar pedido
curl -X POST https://erp-automation-system.onrender.com/api/pedidos \
  -H "Content-Type: application/json" \
  -d '{"cliente":"Empresa X","descricao":"Pedido teste","prioridade":"alta"}'

# Listar pedidos
curl https://erp-automation-system.onrender.com/api/pedidos
```
