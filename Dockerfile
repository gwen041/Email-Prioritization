FROM node:22-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY data/requirements.txt ./data/requirements.txt

RUN python3 -m venv data/venv

RUN ./data/venv/bin/pip install --no-cache-dir --upgrade pip \
    && ./data/venv/bin/pip install --no-cache-dir -r data/requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

COPY . .

RUN ./data/venv/bin/python data/setup_models.py

WORKDIR /app/backend

RUN npm install

RUN npm run build

ENV PYTHON_PATH=/app/data/venv/bin/python

ENV PORT=5000

EXPOSE 5000

CMD ["npm", "start"]
