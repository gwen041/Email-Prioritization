# Use a Node base image that also has Python
FROM node:22-slim

# Install Python and essential build tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy the requirements file explicitly first
COPY data/requirements.txt ./data/requirements.txt

# --- Set up Python Data Service ---
# Create virtual environment
RUN python3 -m venv data/venv
# Install Python dependencies
RUN ./data/venv/bin/pip install --no-cache-dir --upgrade pip \
    && ./data/venv/bin/pip install --no-cache-dir -r data/requirements.txt

# Copy the rest of the project
COPY . .

# Download/setup models during build to reduce runtime startup time
RUN ./data/venv/bin/python data/setup_models.py

# --- Set up Node Backend ---
WORKDIR /app/backend
# Install dependencies
RUN npm install
# Build the TypeScript project
RUN npm run build

# --- Runtime Configuration ---
# Environment variable to tell the backend where Python is
ENV PYTHON_PATH=/app/data/venv/bin/python
ENV PORT=5000

# Expose the backend port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
