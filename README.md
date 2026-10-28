# publikou-api-console

Demo do Publikou (HTML, CSS e JS puros, sem build) sobre o `publikou-backend-service` rodando localmente.

```bash
# backend (passos completos no README dele)
cd ../publikou-backend-service
docker compose up -d --wait && mkdir -p logs && make migrations && make run   # API em http://localhost:3333

# demo
cd ../publikou-api-console && python3 -m http.server 5500
```

Abra http://localhost:5500. Para outra API: `http://localhost:5500/?api=http://host:porta` (fica salvo).

A URL padrão da API vem de `config.js` (local: `http://localhost:3333`). Ordem: `?api=` / valor salvo no `localStorage` > `config.js` > `http://localhost:3333`.

## Deploy na Vercel

1. Importe o repositório na Vercel (Framework Preset: **Other**; o `vercel.json` já define build e saída).
2. Em *Settings > Environment Variables*, defina `PUBLIKOU_API_URL` com a URL pública da API (ex.: `https://api.exemplo.com`, veja `.env.example`).
3. Deploy. O `npm run build` (`scripts/build.mjs`) copia os arquivos para `dist/` e gera `dist/config.js` com a env; sem ela, o build falha.

Pela CLI: `vercel env add PUBLIKOU_API_URL` e `vercel --prod`.

A API precisa estar em **HTTPS** (página HTTPS não chama `http://`, mixed content) e acessível pela internet. Mudou a env? Faça redeploy: ela é lida só no build. `/console` abre o console de endpoints.

## Telas

- **Entrar / Criar conta**: cadastro e login; o JWT fica no `localStorage` (expira conforme `JWT_TTL`).
- **Minhas empresas**: lista e cadastro por CNPJ (consulta a BrasilAPI; só MEI, ME e EPP).
- **O que eu vendo**: navega no catálogo CATMAT/CATSER (grupo › classe › item) ou busca pelo nome; escolhe classes e itens, palavras-chave, onde atende (UF ou município) e filtros. "Salvar e buscar oportunidades" salva e roda o match.
- **Oportunidades**: botão "Fazer match agora", lista por nota com o motivo, itens compatíveis, prazo, valor, link do PNCP e "Me interessa" / "Não é pra mim".
- **Administração** (só usuário com `type = 'adm'`): roda `sync-insert`, `sync-update` e `classify-pending`, lista as sincronizações (com retentativa) e mostra a cobertura da classificação.

`console.html` é o console genérico de endpoints (todas as rotas, JSON cru).

Não precisa de mudança no backend: o FluxGo aplica `cors.New()` padrão do Fiber (qualquer origem).
