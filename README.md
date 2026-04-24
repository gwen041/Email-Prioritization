# Siftly AI Email Prioritization

Siftly is an AI-powered email prioritization tool that helps you focus on what matters. It connects to your Gmail, analyzes your emails using Natural Language Processing (NLP), and ranks them by urgency and authority.

## Features

- **Real-time Priority Scoring**: Automatically ranks emails on a 0-100 scale.
- **Deadline Detection**: Extracts deadlines from email content using spaCy and sophisticated heuristics.
- **Authority Analysis**: Identifies high-authority senders and corporate domains.
- **Task Complexity**: Estimates the effort required for each email.
- **Customizable Weights**: Adjust how much each factor influences the final score.
- **Privacy First**: All processing happens locally; your email data is never stored externally.

## Project Structure

- `frontend/`: Next.js dashboard and settings interface.
- `backend/`: Node.js Express server handling Gmail API and orchestration.
- `data/`: Python-based scoring engine using spaCy and DistilBERT.

## Setup

### Backend & Frontend
1. Install dependencies:
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```
2. Configure your Google OAuth credentials in `backend/src/config/`.

### Scoring Engine
1. Create a Python virtual environment:
   ```bash
   cd data
   python -m venv venv
   source venv/bin/activate  # or venv\Scripts\activate on Windows
   pip install -r requirements.txt
   ```
2. Download the spaCy model:
   ```bash
   python -m spacy download en_core_web_sm
   ```

## Running the Application

1. Start the backend:
   ```bash
   cd backend
   npm run dev
   ```
2. Start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```

Access the dashboard at `http://localhost:3000`.
