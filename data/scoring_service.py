import os
import json
import spacy
from datetime import datetime, timedelta
from dateutil.parser import parse as parse_date
import sys
from transformers import pipeline
import re
from fastapi import FastAPI, Request
from pydantic import BaseModel
from typing import List, Optional, Union, Dict, Any
import uvicorn
import calendar
from datetime import timezone

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
    classifier = pipeline("text-classification", model="distilbert-base-uncased-finetuned-sst-2-english")

print(f"DEBUG: All models loaded. Service ready.", file=sys.stderr)

class EmailScorer:
    def __init__(self, settings_path=None, user_email=None):
        self.settings_path = settings_path
        self.user_email = user_email
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
        if self.settings_path and os.path.exists(self.settings_path):
            try:
                with open(self.settings_path, "r") as f:
                    data = json.load(f)
                    user_data = {}
                    if self.user_email and self.user_email in data:
                        user_data = data[self.user_email]
                    elif "__default__" in data:
                        user_data = data["__default__"]
                    elif "weights" in data:
                        user_data = data
                    
                    if "weights" in user_data:
                        self.settings["weights"].update(user_data["weights"])
                    if "important_senders" in user_data:
                        self.settings["important_senders"] = user_data["important_senders"]
            except Exception as e:
                pass

    def extract_deadline(self, text, base_date=None):
        text_clean = re.sub(r'(?i)\b(\d{1,2})(am|pm)\b', r'\1 \2', text)
        doc = nlp(text_clean)
        deadlines = []
        ref_now = base_date if base_date else datetime.now()
        text_lower = text_clean.lower()
        
        for ent in doc.ents:
            if ent.label_ in ["DATE", "TIME"]:
                try:
                    dt = parse_date(ent.text, fuzzy=True, default=ref_now)
                    ent_lower = ent.text.lower()
                    if "today" in ent_lower:
                        dt = ref_now.replace(hour=dt.hour, minute=dt.minute)
                    elif "tomorrow" in ent_lower:
                        dt = (ref_now + timedelta(days=1)).replace(hour=dt.hour, minute=dt.minute)
                    
                    start_idx = max(0, ent.start - 3)
                    pre_context = doc[start_idx:ent.start].text.lower()
                    context_score = 0
                    if any(w in pre_context for w in ["by", "before", "due", "deadline", "end of"]):
                        context_score += 20
                    if any(w in pre_context for w in ["on", "since", "from", "yesterday", "last"]):
                        context_score -= 20
                    deadlines.append((dt, ent.text, context_score))
                except:
                    continue

        if not deadlines:
            if "within the hour" in text_lower:
                deadlines.append((ref_now + timedelta(hours=1), "within the hour", 10))
            elif "this afternoon" in text_lower or "afternoon" in text_lower:
                dt = ref_now.replace(hour=15, minute=0, second=0)
                deadlines.append((dt, "afternoon", 0))
            elif "tonight" in text_lower or "evening" in text_lower:
                dt = ref_now.replace(hour=20, minute=0, second=0)
                deadlines.append((dt, "tonight", 0))
        
        if not deadlines: return None, None
            
        MONTH_NAMES = {m.lower() for m in calendar.month_name if m} | {m.lower() for m in calendar.month_abbr if m}
        def is_explicit(t_val):
            t = t_val.lower()
            return any(m in t for m in MONTH_NAMES) or re.search(r'\d{1,2}[:/]\d{2}', t) or re.search(r'\d{1,2}\s*(am|pm)', t, re.IGNORECASE)
        
        valid_deadlines = []
        for dt_val, text_val, ctx_score in deadlines:
            compare_dt = dt_val.astimezone(timezone.utc) if dt_val.tzinfo else dt_val.replace(tzinfo=timezone.utc)
            compare_now = datetime.now(timezone.utc)
            diff_hours = (compare_dt - compare_now).total_seconds() / 3600
            if diff_hours > -72:
                valid_deadlines.append({"dt": dt_val, "text": text_val, "diff": diff_hours, "ctx": ctx_score, "explicit": is_explicit(text_val)})
        
        if not valid_deadlines: return None, None
        explicit_deadlines = [x for x in valid_deadlines if x["explicit"]]
        candidates = explicit_deadlines if explicit_deadlines else valid_deadlines
        futures = [x for x in candidates if x["diff"] >= 0]
        if futures:
            futures.sort(key=lambda x: (-x["ctx"], x["dt"]))
            return futures[0]["dt"], futures[0]["text"]
        candidates.sort(key=lambda x: (-x["ctx"], -x["diff"]))
        return candidates[0]["dt"], candidates[0]["text"]

    def calculate_deadline_score(self, deadline):
        if not deadline: return 0
        if deadline.tzinfo:
            now = datetime.now(timezone.utc)
            deadline = deadline.astimezone(timezone.utc)
        else:
            now = datetime.now()
        diff = (deadline - now).total_seconds() / 3600
        if diff < 0: return 0 
        if diff < 24: return round(30 + (10 * (1 - (diff / 24.0))))
        elif 24 <= diff < 72:
            days_diff = diff / 24.0
            return round(15 + (14 * (1 - ((days_diff - 1) / 2.0))))
        return 5 if diff < 168 else 2

    def calculate_sender_score(self, sender_email, sender_name=""):
        sender_lower = sender_email.lower()
        if any(important.lower() in sender_lower for important in self.settings["important_senders"]):
            return 30
        score = 0
        if ".gov" in sender_lower: score += 9
        elif ".edu" in sender_lower: score += 5
        elif "@" in sender_lower:
            domain = sender_lower.split("@")[-1]
            if domain not in ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com"]: score += 7
            else: score += 2
        titles = ["ceo", "manager", "director", "prof", "dr", "lead", "vp", "president", "chairman", "cfo", "coo"]
        if any(title in sender_name.lower() or title in sender_email.lower() for title in titles): score += 5
        return min(score, 30)

    def calculate_complexity_score(self, body):
        doc = nlp(body)
        verbs = [token for token in doc if token.pos_ == "VERB"]
        step_keywords = ["step", "first", "second", "finally", "then", "next"]
        steps_count = sum(1 for token in doc if token.text.lower() in step_keywords)
        structural_score = (len(verbs) * 2) + (steps_count * 3)
        res = classifier(body[:512])[0]
        vibe_score = 10 if res['label'] == 'NEGATIVE' and res['score'] > 0.8 else 5 if res['score'] > 0.5 else 2
        raw_score = structural_score + vibe_score
        return 20 if raw_score >= 16 else 12 if raw_score >= 6 else 4

    def check_escalation(self, text):
        keywords = ["urgent", "asap", "immediately", "emergency", "action required", "priority"]
        found_keywords = [kw for kw in keywords if kw in text.lower()]
        if found_keywords: return 10, found_keywords[0]
        domain_terms = ["ferc", "mark-to-market", "california power"]
        found_domain = [dt for dt in domain_terms if dt in text.lower()]
        return (5, found_domain[0]) if found_domain else (0, "")

    def generate_explanation(self, factors, classification):
        reasons = []
        if factors["escalation"]["raw"] > 0 and factors["escalation"].get("evidence"):
            reasons.append(f"urgent escalation keyword '{factors['escalation']['evidence']}' was detected")
        if classification["sender"] == "High":
            reasons.append("it originated from a high-authority sender")
        if factors["deadline"]["raw"] >= 35:
            reasons.append(f"an immediate deadline '{factors['deadline']['evidence']}' was identified")
        elif factors["deadline"]["raw"] >= 20:
            reasons.append(f"a near-term deadline '{factors['deadline']['evidence']}' was identified")
        if classification["complexity"] == "Complex":
            reasons.append("the task involves multi-step structural complexity")
        if not reasons: return "This message was reviewed and ranked based on standard priority metrics."
        if len(reasons) == 1: return f"This message was prioritized because {reasons[0]}."
        return f"This message was prioritized because {', '.join(reasons[:-1])}, and {reasons[-1]}."

    def score_email(self, email_data):
        subject = (email_data.get("subject") or "")
        body = (email_data.get("body") or "")
        sender_email = (email_data.get("from") or email_data.get("sender") or "")
        sender_name = (email_data.get("sender_name") or "")
        received_date_str = email_data.get("date")
        base_date = parse_date(received_date_str) if received_date_str else None
        text = subject + " " + body
        deadline, deadline_snippet = self.extract_deadline(text, base_date=base_date)
        raw_deadline = self.calculate_deadline_score(deadline)
        raw_sender = self.calculate_sender_score(sender_email, sender_name)
        raw_complexity = self.calculate_complexity_score(body)
        raw_escalation, escalation_snippet = self.check_escalation(text)
        w = self.settings["weights"]
        score = ((raw_deadline / 40 * w["deadline_weight"]) + (raw_sender / 30 * w["sender_weight"]) + (raw_complexity / 20 * w["task_weight"]) + (raw_escalation / 10 * w["escalation_weight"]))
        now = datetime.now(timezone.utc) if deadline and deadline.tzinfo else datetime.now()
        diff = (deadline - now).total_seconds() / 3600 if deadline else None
        is_overdue, urgency_label = False, "Low"
        if diff is not None:
            if diff < 0: is_overdue, urgency_label, score = True, "Overdue", 0
            elif diff < 24: score *= (1.0 + (0.5 * (1 - (diff / 24.0))))
        score = min(100, round(score))
        if not is_overdue: urgency_label = "High" if score >= 75 else "Medium" if score >= 45 else "Low"
        contrib_deadline = round(raw_deadline / 40 * w["deadline_weight"])
        contrib_sender = round(raw_sender / 30 * w["sender_weight"])
        contrib_complexity = round(raw_complexity / 20 * w["task_weight"])
        contrib_escalation = round(raw_escalation / 10 * w["escalation_weight"])
        factors = {
            "deadline": { "raw": contrib_deadline, "contribution": contrib_deadline, "evidence": deadline_snippet },
            "sender": { "raw": contrib_sender, "contribution": contrib_sender },
            "complexity": { "raw": contrib_complexity, "contribution": contrib_complexity },
            "escalation": { "raw": contrib_escalation, "contribution": contrib_escalation, "evidence": escalation_snippet }
        }
        classification = { "sender": "High" if raw_sender >= 25 else "Medium" if raw_sender >= 10 else "Low", "complexity": "Complex" if raw_complexity >= 16 else "Moderate" if raw_complexity >= 6 else "Simple" }
        return { "total_score": score, "urgency_label": urgency_label, "factors": factors, "deadline": deadline.isoformat() if deadline else None, "classification": classification, "explanation": self.generate_explanation(factors, classification) }

app = FastAPI()

class PrioritizeRequest(BaseModel):
    emails: Union[List[Dict[str, Any]], Dict[str, Any]]
    settings_path: Optional[str] = None
    user_email: Optional[str] = None

@app.post("/prioritize")
async def prioritize(req: PrioritizeRequest):
    scorer = EmailScorer(settings_path=req.settings_path, user_email=req.user_email)
    if isinstance(req.emails, list):
        return [scorer.score_email(e) for e in req.emails]
    return scorer.score_email(req.emails)

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
