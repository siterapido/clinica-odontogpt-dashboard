# estudante.odontogpt.com — Caddy (host)

# Reutiliza o mesmo build estático e API :8001 do painel OdontoGPT.
# Adicione ao Caddyfile do host (ex.: /etc/caddy/Caddyfile ou bloco em /opt/evolution-api/Caddyfile):

estudante.odontogpt.com {
    encode zstd gzip
    handle /api/* {
        reverse_proxy 127.0.0.1:8001
    }
    handle {
        root * /srv/clinica-odontogpt-dashboard
        try_files {path} /index.html
        file_server
    }
}

# DNS: A/AAAA estudante.odontogpt.com → VPS
# Env backend: ODONTO_HERMES_API_URL, ODONTO_HERMES_API_KEY (perfil odonto-gpt :8643)
# Deploy:
#   cd /root/clinica-odontogpt-dashboard/frontend && npm run build
#   sudo rsync -a --delete dist/ /srv/clinica-odontogpt-dashboard/
#   sudo systemctl restart odontogpt-api
