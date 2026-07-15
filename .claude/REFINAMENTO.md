# Instruções para o Claude — Refinar OdontoGPT Dashboard

## Contexto
O dashboard da Clínica OdontoGPT já está em produção em https://clinica.odontogpt.com com:
- Backend FastAPI (porta 8001) — sistema service `odontogpt-api.service`
- Frontend React + Vite buildado em `frontend/dist/`
- Caddy container `evolution_caddy` servindo em `clinica.odontogpt.com`
- API de login com senha `ODONTOGPT_DASH_PASSWORD` (padrão `odontogpt2026`)
- Banco SQLite em `/root/.hermes-docker/odonto_gpt/data/crm.db` (read-only)

## Mudanças necessárias

### 1. Identidade Visual (do site https://odontogpt.vercel.app/)
- A logo está baixada em: `/root/clinica-odontogpt-dashboard/frontend/public/logo-odontogpt-branca.png`
- É uma logo branca (originalmente para fundo escuro). Adaptar para tema claro.
- O site odontogpt.vercel.app tem branding "Odonto GPT" / "Odonto Suite"

### 2. Tema Claro com Sidebar Azul
- **Fundo geral**: claro, off-white (#FAFAF8 ou similar)
- **Sidebar**: azul (ex: #1A5276, #2C6B9E, #3B82F6 ou similar azul profissional) — não mais verde/sage
- **Botões/links principais**: tom azul que combine com a sidebar
- **Cards**: brancos com sombra suave
- **Tipografia**: Inter (já está)
- **Cantos arredondados**: manter 12-14px
- **Sem tema escuro**

### 3. Tela de Login (já existe, só refinar)
- Componente em `frontend/src/pages/Login.jsx` (já criado)
- `App.jsx` já controla autenticação (verificar se está correto)
- Deve mostrar o logo da OdontoGPT e o nome
- Design clean, centralizado

### 4. Sidebar
- Cor azul escuro (#1A3A5C ou similar)
- Navegação: Dashboard, Pacientes, Agendamentos, Prontuários
- Botão de Sair
- Logo no topo (versão branca para contrastar com fundo azul escuro)

### 5. Navegação
- Links do sidebar: Dashboard, Pacientes, Agendamentos, Prontuários
- Remover os emojis/icons antigos (📊 👥 📅 📋)
- Usar os nomes limpos

### 6. Deploy
- Rebuild: `cd frontend && npm run build`
- Copiar para Caddy: `docker cp frontend/dist/. evolution_caddy:/srv/clinica-odontogpt-dashboard/`
- Remover arquivos JS antigos dentro do container antes de copiar
- Validar: `curl -sI https://clinica.odontogpt.com/` retorna 200

## Design preciso (para não usar IA slop)
- Nada genérico, nada "lorem ipsum"
- Nada de clipart de dente
- Ícones sutis ou nenhum ícone
- Espaçamento limpo, tipografia clara
- Apenas dados reais do banco (que está vazio) → mostrar empty states

## Comandos finais
```bash
cd /root/clinica-odontogpt-dashboard
npm run build  # em frontend/
docker exec evolution_caddy rm -f /srv/clinica-odontogpt-dashboard/assets/index-*.js
docker cp frontend/dist/. evolution_caddy:/srv/clinica-odontogpt-dashboard/
curl -sI https://clinica.odontogpt.com/ | head -5
curl -s https://clinica.odontogpt.com/api/health
```

**IMPORTANTE**: Valide com curl que o login retorna token e que as métricas retornam 200 com token.
