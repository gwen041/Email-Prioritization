import os
import json
import spacy
from datetime import datetime, timedelta
from dateutil.parser import parse as parse_date
import pandas as pd
from transformers import pipeline

# Load NLP models
nlp = spacy.load("en_core_web_sm")
classifier = pipeline("text-classification", model="distilbert-base-uncased-finetuned-sst-2-english")

class EmailScorer:
    def __init__(self, settings_path="../backend/settings.json"):
        self.settings_path = settings_path
        self.load_settings()

    def load_settings(self):
        self.settings = {
            "weights": {"deadline_proximity": 40, "sender_authority": 30, "task_complexity": 20},
            "bonuses": {"escalation": 10, "dependency": 10}
        }
        if os.path.exists(self.settings_path):
            try:
                with open(self.settings_path, "r") as f:
                    data = json.load(f)
                    if "factors" in data:
                        for factor in data["factors"]:
                            fid = factor.get("id")
                            weight = factor.get("weight", 0)
                            if fid in self.settings["weights"]:
                                self.settings["weights"][fid] = weight
                            elif fid == "escalation_keywords":
                                self.settings["bonuses"]["escalation"] = weight
                            elif fid == "dependency_chain":
                                self.settings["bonuses"]["dependency"] = weight
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
                    if dt > datetime.now():
                        deadlines.append(dt)
                except:
                    continue
        return min(deadlines) if deadlines else None

    def calculate_deadline_score(self, deadline):
        if not deadline:
            return 0
        diff = (deadline - datetime.now()).total_seconds() / 3600 # hours
        if diff <= 0:
            return 40.0 # Max raw baseline
        
        if diff < 24:
            score = 30 + (10 * (1 - (diff / 24.0)))
        elif diff < 168:
            score = 15 + (15 * (1 - ((diff - 24) / 144.0)))
        elif diff < 720:
            score = 5 + (10 * (1 - ((diff - 168) / 552.0)))
        else:
            score = 2.0
            
        return max(0, score)

    def calculate_sender_score(self, sender):
        # Dummy authority logic: check for 'manager', 'director', or high-level domains
        high_authority = ["manager", "director", "ceo", "vp", "lead"]
        score = 0
        if any(term in sender.lower() for term in high_authority):
            score = self.settings["weights"]["sender_authority"]
        return score

    def calculate_complexity_score(self, body):
        # Use DistilBERT to check if the sentiment is "NEG" (often correlating with urgent/complex tasks)
        # or just use length/specific keyword density as a proxy for rule-based.
        # Here we use text length and task-like keywords.
        keywords = ["project", "report", "analysis", "budget", "plan"]
        count = sum(1 for kw in keywords if kw in body.lower())
        score = min(self.settings["weights"]["task_complexity"], count * 5)
        return score

    def check_escalation(self, body):
        keywords = ["urgent", "asap", "emergency", "immediately", "priority"]
        return any(kw in body.lower() for kw in keywords)

    def check_dependency(self, body):
        keywords = ["blocked", "waiting", "depends", "dependency", "pending"]
        return any(kw in body.lower() for kw in keywords)

    def score_email(self, email_data):
        """
        email_data: { "subject": "", "body": "", "sender": "", "date": "" }
        """
        # Sanitize text to remove surrogate characters that cause UnicodeEncodeError on Windows
        subject = (email_data.get("subject") or "").encode('utf-8', 'ignore').decode('utf-8')
        body = (email_data.get("body") or "").encode('utf-8', 'ignore').decode('utf-8')
        sender = (email_data.get("from") or email_data.get("sender") or "").encode('utf-8', 'ignore').decode('utf-8')

        text = subject + " " + body
        deadline = self.extract_deadline(text)
        
        score_deadline = self.calculate_deadline_score(deadline)
        score_sender = self.calculate_sender_score(email_data.get('from', email_data.get('sender', '')))
        score_complexity = self.calculate_complexity_score(email_data["body"])
        
        is_escalated = self.check_escalation(text)
        is_dependent = self.check_dependency(text)
        
        total_score = score_deadline + score_sender + score_complexity
        if is_escalated:
            total_score += self.settings["bonuses"]["escalation"]
        if is_dependent:
            total_score += self.settings["bonuses"]["dependency"]
            
        return {
            "total_score": round(total_score, 2),
            "factors": {
                "deadline": round(score_deadline, 2),
                "sender": round(score_sender, 2),
                "complexity": round(score_complexity, 2),
                "escalated": is_escalated,
                "dependent": is_dependent
            },
            "deadline": deadline.isoformat() if deadline else None
        }

if __name__ == "__main__":
    import sys
    # Ensure stdin is read as UTF-8 on Windows
    if sys.platform == "win32":
        import io
        sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
    
    # Read email data from stdin (JSON)
    try:
        email_data = json.load(sys.stdin)
    except Exception as e:
        print(json.dumps({"error": f"JSON parse error: {str(e)}"}))
        sys.exit(1)

    scorer = EmailScorer()
    if isinstance(email_data, list):
        results = [scorer.score_email(email) for email in email_data]
        print(json.dumps(results))
    else:
        result = scorer.score_email(email_data)
        print(json.dumps(result))
