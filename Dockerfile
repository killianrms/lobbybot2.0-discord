FROM node:20-bookworm-slim

# Dépendances SYSTÈME (Linux uniquement) pour fn_account_generator, monté sur
# /app/generator (voir docker-compose.yml). Le générateur tourne en mode headed
# (anti-détection) et ce serveur n'a pas d'écran : xvfb-run fournit un écran
# virtuel. Ces paquets sont propres au serveur — les postes Windows des
# utilisateurs ont un vrai écran et n'installent que les paquets pip.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-venv build-essential xvfb xauth xclip \
    && rm -rf /var/lib/apt/lists/*

# Dépendances PYTHON : doivent rester alignées sur le requirements.txt du
# générateur (source de vérité, partagée avec le kit Windows). Elles sont
# recopiées ici parce que le générateur est monté au runtime et n'existe donc
# pas dans le contexte de build. Xvfb n'y figure PAS : ce n'est pas un paquet pip.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN python3 -m venv /opt/genv \
    && /opt/genv/bin/pip install --no-cache-dir \
        "playwright>=1.40.0" requests beautifulsoup4 pyperclip colorama cryptography \
        psycopg2-binary python-dotenv \
    && /opt/genv/bin/playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# PYTHON_BIN pointe sur ce wrapper : venv + écran virtuel
RUN printf '#!/bin/sh\nexec xvfb-run -a /opt/genv/bin/python3 "$@"\n' > /usr/local/bin/pygen \
    && chmod +x /usr/local/bin/pygen

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Corrige un crash de fnbr sur les présences EOS incomplètes (voir le script)
RUN node scripts/patch-fnbr.js

RUN npm run build

CMD ["node", "dist/index.js"]
