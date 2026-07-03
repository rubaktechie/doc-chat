# Backend image: Node runtime + Python (markitdown/faiss/openai) in a venv.
FROM node:20-bookworm-slim

# Python for the document-processing scripts. faiss-cpu and markitdown ship
# manylinux wheels, so no compiler toolchain is needed.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps first (better layer caching).
COPY python/requirements.txt ./python/requirements.txt
RUN python3 -m venv /app/python/.venv \
  && /app/python/.venv/bin/pip install --no-cache-dir --upgrade pip \
  && /app/python/.venv/bin/pip install --no-cache-dir -r python/requirements.txt

# Node deps.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# App source.
COPY . .

ENV NODE_ENV=production \
    PYTHON_BIN=/app/python/.venv/bin/python \
    DATA_DIR=/data \
    PORT=3001

EXPOSE 3001
VOLUME ["/data"]
CMD ["node", "src/index.js"]
