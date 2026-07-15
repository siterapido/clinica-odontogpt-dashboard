# REFINAMENTO PREMIUM — OdontoGPT Dashboard

## Contexto
Dashboard da Clínica OdontoGPT em https://clinica.odontogpt.com.
- Backend: FastAPI porta 8001 (systemd) — NÃO MEXER
- Frontend: React + Vite, build em frontend/dist/
- Servido via Caddy container evolution_caddy
- Login com senha (env ODONTOGPT_DASH_PASSWORD, padrão odontogpt2026)
- Banco SQLite read-only em /root/.hermes-docker/odonto_gpt/data/crm.db
- Logo: /root/clinica-odontogpt-dashboard/frontend/public/logo-odontogpt-branca.png (809x241px, branca)

## NOVAS DEPENDÊNCIAS INSTALADAS
- tailwindcss + @tailwindcss/vite (já instalado)
- lucide-react (ícones vetoriais premium)
- framer-motion (animações suaves)
- shadcn/ui component library (próximo passo)

Configure o Tailwind CSS no projeto (tailwind.config.js + postcss.config.js + import no CSS).
O vite.config.js deve importar tailwindcss plugin.

## REFERÊNCIAS DE DESIGN PREMIUM (pesquisadas na internet)

### Inspiração geral
- 50 Best Dashboard Design 2026: transparência, gradientes sutis, tipografia limpa, cards com elevação
- Shadcn UI Kit Hospital Management: referência máxima de dashboard hospitalar shadcn/ui
- TailAdmin: dashboard template open-source Tailwind/React, estrutura limpa com sidebar
- Dribbble dental clinic dashboards: tons azul + branco, gradientes suaves, tipografia Inter

### Paleta de cores premium (healthcare tech)
Use uma paleta sofisticada com gradientes sutis:

```css
--primary: #1E3A5F    /* azul escuro para sidebar e headers */
--primary-light: #2B5A8C  /* azul médio para hover/active */
--accent: #3B82F6     /* azul vibrante para CTAs e indicadores */
--accent-light: #60A5FA /* azul claro para hover */
--surface: #F0F4F8    /* fundo geral cinza azulado claro */
--surface-card: #FFFFFF  /* cards brancos */
--text: #1A202C       /* texto escuro */
--text-secondary: #64748B /* texto secundário */
--border: #E2E8F0     /* bordas suaves */
--success: #10B981    /* verde para confirmado */
--warning: #F59E0B    /* amarelo para pendente */
--danger: #EF4444     /* vermelho para cancelado */
--radius: 16px        /* bordas arredondadas generosas */
--shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)
--shadow-lg: 0 10px 25px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.04)
```

### Diretrizes de design premium (anti-AI slop)
1. **Espaçamento generoso**: padding 24-32px entre seções, 16-20px em cards
2. **Hierarquia visual clara**: títulos grandes e negritos, subtítulos médios, dados em texto corrido
3. **Gradientes sutis**: usar gradientes tonais (ex: de #1E3A5F para #2B5A8C) em vez de cores sólidas chatas
4. **Cards com elevação**: sombra suave + borda 1px + border-radius 16px + hover com translateY(-2px)
5. **Inputs modernos**: borda fina, focus ring azul, placeholder suave
6. **Sidebar escura premium**: fundo gradiente escuro (#1E3A5F → #15294A), texto branco, item ativo com destaque e ícone
7. **Tipografia**: Inter (já carregada), pesos 400/500/600/700, linha de altura 1.5
8. **Ícones**: usar lucide-react (ex: Calendar, Users, FileText, Activity, LogOut, Menu)
9. **Micro-interações**: transições de 200ms ease, hover suave, loading spinner animado
10. **Sem clipart**: nada de desenhos de dente, nada de emojis como ícones (substituir por lucide-react)
11. **Tabelas modernas**: header com fundo levemente azulado, linhas com hover, células com padding 12-16px
12. **Gradiente no topo**: um gradiente sutil horizontal como separador visual
13. **Backdrop blur**: no login/modal se aplicável

### Tela de Login premium
- Fundo com gradiente suave (ex: de #F0F4F8 para #E2E8F0)
- Card central branco com sombra grande, border-radius 20px
- Logo no topo
- Input de senha com ícone de cadeado
- Botão azul gradiente com hover
- "OdontoGPT — Clínica do Futuro" como subtítulo

### Dashboard (página inicial)
- 6 cards de métricas em grid responsivo (3 colunas desktop, 2 tablet, 1 mobile)
- Cada card: ícone lucide na cor correspondente, número grande, label
- Últimos agendamentos: tabela limpa com status badges
- Empty state amigável quando não há dados

### Sidebar
- Gradiente escuro (#1E3A5F → #15294A)
- Logo branca no topo com padding
- Links de navegação com ícones lucide
- Item ativo com fundo branco 10% opacity + borda esquerda
- Botão Sair no final com hover vermelho sutil

## ESTRUTURA ESPERADA APÓS MUDANÇA
O projeto deve usar Tailwind CSS + shadcn/ui + lucide-react + framer-motion.
Os arquivos JSX podem usar className do Tailwind.

Se o shadcn/ui não puder ser instalado facilmente, usar Tailwind puro + lucide-react + framer-motion é aceitável.

## DEPLOY
```bash
cd /root/clinica-odontogpt-dashboard/frontend && npm run build
docker exec evolution_caddy rm -rf /srv/clinica-odontogpt-dashboard/*
docker cp dist/. evolution_caddy:/srv/clinica-odontogpt-dashboard/
curl -sI https://clinica.odontogpt.com/ | head -5
```

## VALIDAÇÃO
```python
import requests
base='https://clinica.odontogpt.com'
# 1. Root 200
assert requests.get(base).status_code == 200
# 2. Logo 200
assert requests.get(f'{base}/logo-odontogpt-branca.png').status_code == 200
# 3. Login retorna token
r=requests.post(f'{base}/api/login', json={'password':'odontogpt2026'})
assert r.status_code == 200
token=r.json()['token']
# 4. Endpoints autenticados 200
for ep in ['/api/metricas','/api/pacientes','/api/agendamentos','/api/prontuarios']:
    assert requests.get(base+ep, headers={'Authorization': f'Bearer {token}'}).status_code == 200
print('TUDO OK')
```
