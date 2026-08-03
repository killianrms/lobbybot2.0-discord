FROM node:20-bookworm-slim

# Python + Playwright/Chromium + Xvfb pour fn_account_generator,
# monté sur /app/generator (voir docker-compose.yml). Le générateur tourne
# en mode headed (anti-détection) : xvfb-run fournit le serveur X virtuel.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-venv build-essential xvfb xauth xclip \
    && rm -rf /var/lib/apt/lists/*

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

RUN npm run build

CMD ["node", "dist/index.js"]
