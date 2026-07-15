# Instruções de Implementação — Clinica OdontoGPT Dashboard

## Objetivo
Construir e publicar o dashboard da Clínica OdontoGPT em `https://clinica.odontogpt.com` nesta VPS.

## Contexto
- Perfil OdontoGPT (Hermes) roda em Docker; banco SQLite real: `/root/.hermes-docker/odonto_gpt/data/crm.db`
- O dashboard deve ser APENAS LEITURA sobre esse banco.
- Domínio `clinica.odontogpt.com` já aponta para IP `187.127.252.244`.
- Caddy já roda via container `evolution_caddy` na rede `evolution_net` (IP 172.18.0.5).

## Stack
- Backend: Python FastAPI, porta 8000 no host.
- Frontend: React + Vite, build em `frontend/dist/`.
- Banco: SQLite read-only via `uri=true` e `mode=ro`.
- Proxy: Caddy no container `evolution_caddy`.

## Schema SQLite (tabelas relevantes)
- `pacientes` (id, nome, telefone, whatsapp, data_nascimento, indicacao, observacoes, created_at)
- `agendamentos` (id, paciente_id, dentista, data, horario, status, procedimento, created_at)
- `prontuario` (id, paciente_id, data_atendimento, dentista, procedimento, queixa_principal, exame_clinico, diagnostico, plano_tratamento, observacoes, proximo_retorno_dias, created_at)
- `interacoes` (id, paciente_id, tipo, mensagem, classificacao, created_at)
- `lembretes` (id, agendamento_id, paciente_id, tipo, data_envio, mensagem, status, tentativas, erro, created_at, enviado_at)

## Funcionalidades obrigatórias
1. Login simples: 1 usuário/senha via env `ODONTOGPT_DASH_PASSWORD` (padrão `odontogpt2026`).
2. Página de métricas: total pacientes, agendamentos do dia, agendamentos pendentes, agendamentos realizados hoje.
3. Lista de pacientes com busca e filtros.
4. Lista de agendamentos com filtros por status e data.
5. Prontuários por paciente.
6. Design responsivo, clean, acolhedor.

## Design Direction (premium, anti-AI-slop)
- Anchor: Organic / saúde / confiança.
- Superfície: off-white `#FAFAF8`, toques sage `#8B9D83`, azul suave `#6B8E9F` para ações.
- Tipografia: Inter (Google Fonts) para dados; títulos podem usar serif suave (ex: Source Serif 4 opcional).
- Cantos arredondados 12-16px.
- Sombras suaves (`0 2px 8px rgba(0,0,0,0.04)`).
- Sem tema escuro, sem clipart de dente, sem gradientes gritantes.
- Estados vazios com mensagem amigável (banco está vazio no momento).
- Micro-interações: hover elevation + borda sutil, transições 200-300ms ease.

## Estrutura de arquivos esperada
```
/root/clinica-odontogpt-dashboard/
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── auth.py
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api.js
│       ├── components/
│       ├── pages/
│       └── index.css
├── Caddyfile
├── run-backend.sh
└── README.md
```

## Caddy (container evolution_caddy)
Adicionar ao `/etc/caddy/Caddyfile` do container (caminho real no host: `docker exec evolution_caddy cat /etc/caddy/Caddyfile` para ver; editar via `docker cp` ou volume). Criar configuração:

```
clinica.odontogpt.com {
    header Alt-Svc "clear"
    reverse_proxy /api/* http://host.docker.internal:8000 {
        flush_interval -1
    }
    reverse_proxy /* http://host.docker.internal:8081 {
        flush_interval -1
    }
}
```

Mas como o Caddy está em container e a rede é bridge, `host.docker.internal` pode não funcionar. Use o IP do host na rede evolution_net (`172.18.0.1`) ou crie um container separado na rede `evolution_net` servindo frontend estático na porta 8081 e backend na porta 8000.

DECISÃO: para simplificar, criar um Dockerfile + docker-compose para o dashboard na rede `evolution_net`, usando IP fixo `172.18.0.20`. O container servirá:
- frontend estático na porta 80 interna
- backend FastAPI na porta 8000 interna

Caddy apontará `clinica.odontogpt.com` para `http://172.18.0.20:80` e `/api/*` para `http://172.18.0.20:8000`.

## Passos de execução
1. Criar backend FastAPI com endpoints `/api/health`, `/api/login`, `/api/pacientes`, `/api/agendamentos`, `/api/prontuarios`, `/api/metricas`.
2. Criar frontend React com React Router, login, dashboards.
3. Criar Dockerfile multi-stage (build do frontend + runtime Python).
4. Criar `docker-compose.yml` para subir o container na rede `evolution_net` com IP `172.18.0.20`.
5. Atualizar Caddy do container `evolution_caddy` para incluir `clinica.odontogpt.com`.
6. Rodar `docker compose up -d`.
7. Validar `curl -s -o /dev/null -w "%{http_code}" https://clinica.odontogpt.com` retorna 200.

## Restrições
- NUNCA escreva no banco `/root/.hermes-docker/odonto_gpt/data/crm.db`.
- Não invente dados reais; use estados vazios.
- Não use cores escuras ou tema escuro.
- Não use clipart de dente.
- Sempre rode comandos como root; HOME=/root.
- Valide HTTP 200 no final.
