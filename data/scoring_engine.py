import os
import json
import spacy
from datetime import datetime, timedelta
from dateutil.parser import parse as parse_date
import sys
from transformers import pipeline

# Load NLP models
script_dir = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(script_dir, "models", "distilbert")

print(f"DEBUG: Initializing NLP engines...", file=sys.stderr)

try:
    print(f"DEBUG: Loading spaCy...", file=sys.stderr)
    nlp = spacy.load("en_core_web_sm")
except:
    print(f"DEBUG: spaCy load failed, attempting download...", file=sys.stderr)
    import subprocess
    subprocess.run([sys.executable, "-m", "spacy", "download", "en_core_web_sm"])
    nlp = spacy.load("en_core_web_sm")

print(f"DEBUG: Loading DistilBERT from {MODEL_DIR if os.path.exists(MODEL_DIR) else 'HuggingFace'}...", file=sys.stderr)
try:
    if os.path.exists(MODEL_DIR):
        classifier = pipeline("text-classification", model=MODEL_DIR, tokenizer=MODEL_DIR)
    else:
        classifier = pipeline("text-classification", model="distilbert-base-uncased-finetuned-sst-2-english")
except Exception as e:
    print(f"DEBUG: DistilBERT load failed: {e}", file=sys.stderr)
    # Final fallback attempt
    classifier = pipeline("text-classification", model="distilbert-base-uncased-finetuned-sst-2-english")

print(f"DEBUG: All models loaded.", file=sys.stderr)

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

    def extract_deadline(self, text, base_date=None):
        doc = nlp(text)
        deadlines = []
        
        # Use provided base_date or current time as reference
        ref_now = base_date if base_date else datetime.now()
        
        for ent in doc.ents:
            if ent.label_ in ["DATE", "TIME"]:
                try:
                    # Parse relative to the email's base date
                    dt = parse_date(ent.text, fuzzy=True, default=ref_now)
                    
                    # If it's just a time like "5:00 PM", default=ref_now will set the correct day.
                    # If it's a relative term like "Tomorrow", dateutil handles it decently if we set default.
                    
                    # Check if the text is exactly "today" or "tomorrow" for better accuracy
                    text_lower = ent.text.lower()
                    if "today" in text_lower:
                        dt = ref_now.replace(hour=dt.hour, minute=dt.minute)
                    elif "tomorrow" in text_lower:
                        dt = (ref_now + timedelta(days=1)).replace(hour=dt.hour, minute=dt.minute)
                    
                    deadlines.append((dt, ent.text))
                except:
                    continue
        
        if not deadlines:
            return None, None
            
        # Return the earliest deadline that isn't drastically in the past (noise)
        # But we include overdue ones for the 'OVERDUE' logic
        earliest = min(deadlines, key=lambda x: x[0])
        return earliest[0], earliest[1]

    def calculate_deadline_score(self, deadline):
        """
        Dynamic Scoring Formula:
        < 0 hrs (Overdue) → 0
        0-24 hrs → 30–40 (Continuous)
        1–3 days → 15–29
        4–7 days → 5–14
        > 7 days → 0-4
        """
        if not deadline:
            return 0
            
        # Ensure we compare aware datetimes with aware now, and naive with naive
        if deadline.tzinfo:
            from datetime import timezone
            now = datetime.now(timezone.utc)
            # If deadline is aware but not UTC, convert now to match or convert both to UTC
            deadline = deadline.astimezone(timezone.utc)
        else:
            now = datetime.now()
            
        diff = (deadline - now).total_seconds() / 3600 # hours
        
        if diff < 0:
            return 0 # Overdue emails rank at 0 (bottom) as per UI feedback
            
        if diff < 24:
            # Linear scale: 40 at 0h, 30 at 24h
            return round(30 + (10 * (1 - (diff / 24))))
        elif 24 <= diff < 72:
            # 1 to 3 days: 29 down to 15
            days_diff = diff / 24
            return round(15 + (14 * (1 - ((days_diff - 1) / 2))))
        elif 72 <= diff < 168:
            # 4 to 7 days: 14 down to 5
            return 5
        else:
            return 2

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
        domain_terms = ["ferc", "mark-to-market", "california power"]
        
        found_keywords = [kw for kw in keywords if kw in text.lower()]
        found_domain = [dt for dt in domain_terms if dt in text.lower()]
        
        score = 0
        snippet = ""
        
        if found_keywords:
            score = 10
            snippet = found_keywords[0]
        elif found_domain:
            score = 5
            snippet = found_domain[0]
            
        return score, snippet

    def generate_explanation(self, factors, classification):
        reasons = []
        
        # Escalation Evidence
        if factors["escalation"]["raw"] > 0 and factors["escalation"].get("evidence"):
            reasons.append(f"urgent escalation keyword '{factors['escalation']['evidence']}' was detected")
        elif factors["escalation"]["raw"] > 0:
            reasons.append("urgent escalation keywords were detected")

        # Sender Authority
        if classification["sender"] == "High":
            reasons.append("it originated from a high-authority sender")

        # Deadline Evidence
        if factors["deadline"]["raw"] >= 35:
            deadline_str = f" '{factors['deadline']['evidence']}'" if factors['deadline'].get('evidence') else ""
            reasons.append(f"an immediate deadline{deadline_str} was identified")
        elif factors["deadline"]["raw"] >= 20:
            deadline_str = f" '{factors['deadline']['evidence']}'" if factors['deadline'].get('evidence') else ""
            reasons.append(f"a near-term deadline{deadline_str} was identified")
        
        # Complexity
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
        email_data: { "subject": "", "body": "", "from": "", "sender_name": "", "date": "" }
        """
        subject = (email_data.get("subject") or "").encode('utf-8', 'ignore').decode('utf-8')
        body = (email_data.get("body") or "").encode('utf-8', 'ignore').decode('utf-8')
        sender_email = (email_data.get("from") or email_data.get("sender") or "").encode('utf-8', 'ignore').decode('utf-8')
        sender_name = (email_data.get("sender_name") or email_data.get("sender_title") or "").encode('utf-8', 'ignore').decode('utf-8')
        received_date_str = email_data.get("date")

        base_date = None
        if received_date_str:
            try:
                base_date = parse_date(received_date_str)
            except:
                base_date = None

        text = subject + " " + body
        deadline, deadline_snippet = self.extract_deadline(text, base_date=base_date)
        
        # Raw Scores
        raw_deadline = self.calculate_deadline_score(deadline)
        raw_sender = self.calculate_sender_score(sender_email, sender_name)
        raw_complexity = self.calculate_complexity_score(body)
        raw_escalation, escalation_snippet = self.check_escalation(text)

        # Normalized Weights from settings
        w = self.settings["weights"]
        
        # Final Score = (raw / max * weight)
        score = (
            (raw_deadline / 40 * w["deadline_weight"]) +
            (raw_sender / 30 * w["sender_weight"]) +
            (raw_complexity / 20 * w["task_weight"]) +
            (raw_escalation / 10 * w["escalation_weight"])
        )

        from datetime import timezone
        now = datetime.now(timezone.utc) if deadline and deadline.tzinfo else datetime.now()
        diff = (deadline - now).total_seconds() / 3600 if deadline else None

        is_overdue = False
        urgency_label = "Low"

        if diff is not None:
            if diff < 0:
                is_overdue = True
                urgency_label = "Overdue"
            elif diff < 24:
                score *= 1.5 # Huge override multiplier for immediate deadlines
                
        score = min(100, round(score))

        if not is_overdue:
            if score >= 75:
                urgency_label = "High"
            elif score >= 45:
                urgency_label = "Medium"
            else:
                urgency_label = "Low"

        factors = {
            "deadline": { "raw": round(raw_deadline), "contribution": round((raw_deadline / 40 * w["deadline_weight"])), "evidence": deadline_snippet },
            "sender": { "raw": round(raw_sender), "contribution": round((raw_sender / 30 * w["sender_weight"])) },
            "complexity": { "raw": round(raw_complexity), "contribution": round((raw_complexity / 20 * w["task_weight"])) },
            "escalation": { "raw": round(raw_escalation), "contribution": round((raw_escalation / 10 * w["escalation_weight"])), "evidence": escalation_snippet }
        }

        classification = {
            "sender": "High" if raw_sender >= 25 else "Medium" if raw_sender >= 10 else "Low",
            "complexity": "Complex" if raw_complexity >= 16 else "Moderate" if raw_complexity >= 6 else "Simple"
        }

        explanation = self.generate_explanation(factors, classification)

        return {
            "total_score": score,
            "urgency_label": urgency_label,
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
        data = json.loads(input_data)
    except Exception as e:
        print(json.dumps({"error": f"JSON parse error: {str(e)}"}))
        sys.exit(1)

    scorer = EmailScorer()
    
    # Handle Batch Input
    if isinstance(data, list):
        results = [scorer.score_email(email) for email in data]
        print(json.dumps(results))
    else:
        result = scorer.score_email(data)
        print(json.dumps(result))
