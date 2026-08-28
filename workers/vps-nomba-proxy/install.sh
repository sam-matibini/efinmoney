#!/bin/bash
# Run on Ubuntu Oracle Cloud VM after copying this folder to ~/vps-nomba-proxy
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if [ ! -f .env ]; then
  SECRET=$(openssl rand -hex 24)
  cat > .env <<EOF
PORT=8787
PROXY_SECRET=${SECRET}
EOF
  echo "Created .env with new PROXY_SECRET"
  echo "SAVE THIS SECRET FOR SUPABASE:"
  echo "NOMBA_PROXY_SECRET=${SECRET}"
fi

# shellcheck disable=SC1091
set -a && source .env && set +a

sudo tee /etc/systemd/system/vps-nomba-proxy.service >/dev/null <<EOF
[Unit]
Description=eFin Nomba API reverse proxy (static IPv4 egress)
After=network.target

[Service]
Type=simple
WorkingDirectory=$(pwd)
EnvironmentFile=$(pwd)/.env
ExecStart=$(command -v node) $(pwd)/server.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now vps-nomba-proxy

PUBLIC_IP=$(curl -4 -s https://ipv4.icanhazip.com || true)
echo ""
echo "=== Done ==="
echo "Public IPv4 (send to Nomba): ${PUBLIC_IP}"
echo "Health: curl http://${PUBLIC_IP}:8787/health"
echo "Egress: curl http://${PUBLIC_IP}:8787/egress-ip"
echo ""
echo "Supabase (after Nomba whitelists IP):"
echo "  npx supabase secrets set NOMBA_API_BASE=\"http://${PUBLIC_IP}:8787/nomba\" NOMBA_PROXY_SECRET=\"\$(grep PROXY_SECRET .env | cut -d= -f2)\" --project-ref dkdnwumllibwdlqbjkwy"
