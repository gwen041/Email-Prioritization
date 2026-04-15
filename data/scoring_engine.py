import os
import json
import spacy
from datetime import datetime, timedelta
from dateutil.parser import parse as parse_date
import sys
from transformers import pipeline

# Load NLP models
# Need to make sure these are installed: pip install spacy transformers torch
try:
    nlp = spacy.load("en_core_web_sm")
except:
    # Fallback if model not downloaded
    import subprocess
    subprocess.run([sys.executable, "-m", "spacy", "download", "en_core_web_sm"])
    nlp = spacy.load("en_core_web_sm")

classifier = pipeline("text-classification", model="distilbert-base-uncased-finetuned-sst-2-english")

class EmailScorer:
    def __init__(self, settings_path=None):
        if settings_path is None:
            # Resolve relative to this script's directory
            script_dir = os.path.dirname(os.path.abspath(__file__))
            self.settings_path = os.path.join(script_dir, "..", "backend", "settings.json")
        else:
            self.settings_path = settings_path
        self.load_settings()

    def load_settings(self):
        # Defaults
        self.settings = {
            "weights": {
                "deadline_weight": 40,
                "sender_weight": 30,
                "task_weight": 20,
                "escalation_weight": 10
            },
            "important_senders": []
        }
        if os.path.exists(self.settings_path):
            try:
                with open(self.settings_path, "r") as f:
                    data = json.load(f)
                    if "weights" in data:
                        self.settings["weights"].update(data["weights"])
                    if "important_senders" in data:
                        self.settings["important_senders"] = data["important_senders"]
            except Exception as e:
                # Fallback to defaults already set
                pass

    def extract_deadline(self, text):
        doc = nlp(text)
        deadlines = []
        for ent in doc.ents:
            if ent.label_ in ["DATE", "TIME"]:
                try:
                    dt = parse_date(ent.text, fuzzy=True)
                    # If date is in the past, maybe it's for next year or just a mention of past
                    if dt < datetime.now():
                        dt = dt.replace(year=datetime.now().year + 1)
                    if dt > datetime.now():
                        deadlines.append(dt)
                except:
                    continue
        return min(deadlines) if deadlines else None

    def calculate_deadline_score(self, deadline):
        """
        < 24 hrs → 35–40
        1–3 days → 20–34
        4–7 days → 10–19
        > 7 days → 0–9
        """
        if not deadline:
            return 0
        diff = (deadline - datetime.now()).total_seconds() / 3600 # hours
        
        if diff < 24:
            return 40 # Max for < 24 hrs
        elif 24 <= diff < 72:
            return 30 # Mid-high for 1-3 days
        elif 72 <= diff < 168:
            return 15 # Mid-low for 4-7 days
        else:
            return 5 # Low for > 7 days

    def calculate_sender_score(self, sender_email, sender_name=""):
        """
        Hybrid scoring system (Max 30)
        """
        score = 0
        sender_lower = sender_email.lower()
        
        # 1. Important Senders (Primary)
        if any(important.lower() in sender_lower for important in self.settings["important_senders"]):
            return 30 # High Authority Max

        # 2. Domain-Based (Secondary)
        if ".gov" in sender_lower:
            score += 9 # 7-10
        elif ".edu" in sender_lower:
            score += 5 # 5
        elif "@" in sender_lower:
            domain = sender_lower.split("@")[-1]
            public_domains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com"]
            if domain not in public_domains:
                score += 7 # Corporate (5-10)
            else:
                score += 2 # Public (0-3)

        # 3. title / Keyword Detection (Support)
        titles = ["ceo", "manager", "director", "prof", "dr", "lead", "vp", "president", "chairman", "cfo", "coo"]
        if any(title in sender_name.lower() or title in sender_email.lower() for title in titles):
            score += 5 # High level (3-5)
        elif sender_name and any(title in sender_name.lower() for title in ["vp", "director"]):
            score += 4

        # 4. Interaction Frequency (Placeholder)
        # Note: In a real app, we'd pass interaction count from the DB.
        # score += 0 

        score = min(score, 30)
        return score

    def calculate_complexity_score(self, body):
        """
        Hybrid Approach: spaCy for structure, DistilBERT for vibe/urgency.
        Max: 20
        """
        doc = nlp(body)
        
        # 1. spaCy Structural Analysis
        # Count action verbs (POS tagging)
        verbs = [token for token in doc if token.pos_ == "VERB"]
        step_keywords = ["step", "first", "second", "finally", "then", "next"]
        steps_count = sum(1 for token in doc if token.text.lower() in step_keywords)
        
        structural_score = (len(verbs) * 2) + (steps_count * 3)
        
        # 2. DistilBERT Urgency Analysis
        # classifier returns [{'label': 'POSITIVE', 'score': 0.99}] 
        # But we want to know if it's "urgent" vs "casual".
        # The model "distilbert-base-uncased-finetuned-sst-2-english" is sentiment.
        # High "NEGATIVE" sentiment often correlates with urgency/problems.
        res = classifier(body[:512])[0]
        if res['label'] == 'NEGATIVE' and res['score'] > 0.8:
            vibe_score = 10
        elif res['score'] > 0.5:
            vibe_score = 5
        else:
            vibe_score = 2

        raw_score = structural_score + vibe_score
        
        # Map to Buckets: Simple (0-5), Moderate (6-15), Complex (16-20)
        if raw_score >= 16:
            return 20 # Complex Max
        elif raw_score >= 6:
            return 12 # Moderate
        else:
            return 4 # Simple

    def check_escalation(self, text):
        """
        Binary score: 10 or 0
        """
        keywords = ["urgent", "asap", "immediately", "emergency", "action required", "priority"]
        # Enron domain terms - treat as Medium importance (score 5) rather than high escalation
        domain_terms = ["ferc", "mark-to-market", "california power"]
        
        score = 0
        if any(kw in text.lower() for kw in keywords):
            score = 10
        elif any(dt in text.lower() for dt in domain_terms):
            score = 5 # Moderate inflation for domain relevance
            
        return score

    def generate_explanation(self, factors, classification):
        reasons = []
        if factors["escalation"]["raw"] > 0:
            reasons.append("urgent escalation keywords were detected")
        if classification["sender"] == "High":
            reasons.append("it originated from a high-authority sender")
        if factors["deadline"]["raw"] >= 35:
            reasons.append("an immediate deadline was identified")
        elif factors["deadline"]["raw"] >= 20:
            reasons.append("a near-term deadline was identified")
        
        if classification["complexity"] == "Complex":
            reasons.append("the task involves multi-step structural complexity")

        if not reasons:
            return "This message was reviewed and ranked based on standard priority metrics."
        
        # Combine reasons into a nice sentence
        if len(reasons) == 1:
            return f"This message was prioritized because {reasons[0]}."
        else:
            return f"This message was prioritized because {', '.join(reasons[:-1])}, and {reasons[-1]}."

    def score_email(self, email_data):
        """
        email_data: { "subject": "", "body": "", "from": "", "sender_name": "" }
        """
        subject = (email_data.get("subject") or "").encode('utf-8', 'ignore').decode('utf-8')
        body = (email_data.get("body") or "").encode('utf-8', 'ignore').decode('utf-8')
        sender_email = (email_data.get("from") or email_data.get("sender") or "").encode('utf-8', 'ignore').decode('utf-8')
        sender_name = (email_data.get("sender_name") or email_data.get("sender_title") or "").encode('utf-8', 'ignore').decode('utf-8')

        text = subject + " " + body
        deadline = self.extract_deadline(text)
        
        # Raw Scores
        raw_deadline = self.calculate_deadline_score(deadline)
        raw_sender = self.calculate_sender_score(sender_email, sender_name)
        raw_complexity = self.calculate_complexity_score(body)
        raw_escalation = self.check_escalation(text)

        # Normalized Weights from settings
        w = self.settings["weights"]
        
        # Final Score = (raw / max * weight)
        score = (
            (raw_deadline / 40 * w["deadline_weight"]) +
            (raw_sender / 30 * w["sender_weight"]) +
            (raw_complexity / 20 * w["task_weight"]) +
            (raw_escalation / 10 * w["escalation_weight"])
        )

        factors = {
            "deadline": { "raw": raw_deadline, "contribution": round((raw_deadline / 40 * w["deadline_weight"]), 2) },
            "sender": { "raw": raw_sender, "contribution": round((raw_sender / 30 * w["sender_weight"]), 2) },
            "complexity": { "raw": raw_complexity, "contribution": round((raw_complexity / 20 * w["task_weight"]), 2) },
            "escalation": { "raw": raw_escalation, "contribution": round((raw_escalation / 10 * w["escalation_weight"]), 2) }
        }

        classification = {
            "sender": "High" if raw_sender >= 25 else "Medium" if raw_sender >= 10 else "Low",
            "complexity": "Complex" if raw_complexity >= 16 else "Moderate" if raw_complexity >= 6 else "Simple"
        }

        explanation = self.generate_explanation(factors, classification)

        return {
            "total_score": round(score, 2),
            "factors": factors,
            "deadline": deadline.isoformat() if deadline else None,
            "classification": classification,
            "explanation": explanation
        }

if __name__ == "__main__":
    # Ensure stdin is read as UTF-8 on Windows
    if sys.platform == "win32":
        import io
        sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
    
    # Read email data from stdin (JSON)
    try:
        input_data = sys.stdin.read()
        if not input_data:
            print(json.dumps({"error": "No input data"}))
            sys.exit(1)
        email_data = json.loads(input_data)
    except Exception as e:
        print(json.dumps({"error": f"JSON parse error: {str(e)}"}))
        sys.exit(1)

    scorer = EmailScorer()
    result = scorer.score_email(email_data)
    print(json.dumps(result))
