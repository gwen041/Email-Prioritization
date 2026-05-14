# Use a Node.js base image (Debian Bookworm slim) — Python 3 will be installed via apt
FROM node:24-slim

# Install Python 3, venv support, and build tools needed by some pip packages
# python3-pip is included so we can bootstrap the venv's pip
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# --- Install Python dependencies first (better layer caching) ---
COPY data/requirements.txt data/requirements.txt
# Create a virtual environment so we are not affected by PEP 668
# ("externally managed environment") on Debian Bookworm
RUN python3 -m venv data/venv
RUN ./data/venv/bin/pip install --no-cache-dir --upgrade pip \
    && ./data/venv/bin/pip install --no-cache-dir -r data/requirements.txt
# Download the spaCy language model used by scoring_service.py
RUN ./data/venv/bin/python -m spacy download en_core_web_sm

# --- Install Node.js dependencies and build TypeScript ---
COPY backend/package*.json backend/
WORKDIR /app/backend
RUN npm ci --omit=dev=false
WORKDIR /app

# --- Copy the rest of the project ---
COPY . .

# Re-run TypeScript build now that all source files are present
WORKDIR /app/backend
RUN npm run build

# --- Runtime configuration ---
# Tell the Node backend exactly which Python binary to use (the venv's)
ENV PYTHON_PATH=/app/data/venv/bin/python
ENV PORT=5000

EXPOSE 5000

CMD ["npm", "start"]
