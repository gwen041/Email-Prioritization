import os
import json
import spacy
from datetime import datetime, timedelta
from dateutil.parser import parse as parse_date
import sys
from transformers import pipeline
import re

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
    def __init__(self, settings_path=None, user_email=None):
        if settings_path is None:
            script_dir = os.path.dirname(os.path.abspath(__file__))
            self.settings_path = os.path.join(script_dir, "..", "backend", "settings.json")
        else:
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
        if os.path.exists(self.settings_path):
            try:
                with open(self.settings_path, "r") as f:
                    data = json.load(f)
                    
                    # Single JSON keyed by email — look up the user's section
                    user_data = {}
                    if self.user_email and self.user_email in data:
                        user_data = data[self.user_email]
                    elif "__default__" in data:
                        user_data = data["__default__"]
                    elif "weights" in data:
                        # Legacy flat format (old settings.json) — use it directly
                        user_data = data
                    
                    if "weights" in user_data:
                        self.settings["weights"].update(user_data["weights"])
                    if "important_senders" in user_data:
                        self.settings["important_senders"] = user_data["important_senders"]
            except Exception as e:
                pass  # Fallback to defaults

    def extract_deadline(self, text, base_date=None):
        # Pre-process text to fix common issues e.g. "12PM" -> "12 PM"
        text_clean = re.sub(r'(?i)\b(\d{1,2})(am|pm)\b', r'\1 \2', text)
        
        doc = nlp(text_clean)
        deadlines = []
        
        # Use provided base_date or current time as reference
        ref_now = base_date if base_date else datetime.now()
        text_lower = text_clean.lower()
        
        # 1. spaCy Grammar-Assisted Parsing — ALWAYS runs first
        for ent in doc.ents:
            if ent.label_ in ["DATE", "TIME"]:
                try:
                    dt = parse_date(ent.text, fuzzy=True, default=ref_now)
                    
                    ent_lower = ent.text.lower()
                    if "today" in ent_lower:
                        dt = ref_now.replace(hour=dt.hour, minute=dt.minute)
                    elif "tomorrow" in ent_lower:
                        dt = (ref_now + timedelta(days=1)).replace(hour=dt.hour, minute=dt.minute)
                    
                    # --- Grammatical Context Parsing ---
                    # Check the immediate 3-word window preceding this time entity
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

        # 2. Fuzzy Heuristics — only fire when spaCy found NOTHING explicit
        #    These are purely a fallback for vague language like "tonight", "morning", etc.
        if not deadlines:
            if "within the hour" in text_lower:
                deadlines.append((ref_now + timedelta(hours=1), "within the hour", 10))
                
            elif "this afternoon" in text_lower or "afternoon" in text_lower:
                dt = ref_now.replace(hour=15, minute=0, second=0)
                if dt < ref_now and "tomorrow" in text_lower:
                    dt += timedelta(days=1)
                deadlines.append((dt, "afternoon", 0))
                
            elif "tonight" in text_lower or "evening" in text_lower:
                dt = ref_now.replace(hour=20, minute=0, second=0)
                if dt < ref_now and "tomorrow" in text_lower:
                    dt += timedelta(days=1)
                deadlines.append((dt, "tonight", 0))
                
            elif "this morning" in text_lower or "morning" in text_lower:
                dt = ref_now.replace(hour=9, minute=0, second=0)
                if "tomorrow" in text_lower:
                    dt += timedelta(days=1)
                if dt > ref_now or "tomorrow" in text_lower:
                    deadlines.append((dt, "morning", 0))
        
        if not deadlines:
            return None, None
            
        # Separate into future and past deadlines correctly
        from datetime import timezone
        import calendar
        
        # Classify deadlines as "explicit" (contain month+day reference) vs "vague" (relative terms)
        MONTH_NAMES = {m.lower() for m in calendar.month_name if m} | {m.lower() for m in calendar.month_abbr if m}
        VAGUE_TERMS = {"tonight", "today", "tomorrow", "morning", "afternoon", "evening", "within the hour", "now"}
        
        def is_explicit(text_val):
            t = text_val.lower()
            # Explicit if it contains a month name or looks like a concrete date/time with digits
            if any(month in t for month in MONTH_NAMES):
                return True
            if re.search(r'\d{1,2}[:/]\d{2}', t):  # e.g. 11:40, 7:00
                return True
            if re.search(r'\d{1,2}\s*(am|pm)', t, re.IGNORECASE):  # e.g. 7 AM
                return True
            return False
        
        valid_deadlines = []
        for dt_val, text_val, ctx_score in deadlines:
            compare_dt = dt_val.astimezone(timezone.utc) if dt_val.tzinfo else dt_val.replace(tzinfo=timezone.utc)
            compare_now = datetime.now(timezone.utc)
            diff_hours = (compare_dt - compare_now).total_seconds() / 3600
            
            # Exclude ridiculous past noise (e.g. fragments from years ago)
            if diff_hours > -72:
                valid_deadlines.append({
                    "dt": dt_val, 
                    "text": text_val, 
                    "diff": diff_hours,
                    "ctx": ctx_score,
                    "explicit": is_explicit(text_val)
                })
        
        if not valid_deadlines:
            return None, None
        
        # PRIORITY RULE: If any explicit absolute dates exist, ignore all vague relative terms.
        # "april 17 at 11:40 PM" beats "tonight" every time.
        explicit_deadlines = [x for x in valid_deadlines if x["explicit"]]
        if explicit_deadlines:
            candidates = explicit_deadlines
        else:
            candidates = valid_deadlines
            
        # Partition into future and short-term past
        futures = [x for x in candidates if x["diff"] >= 0]
        pasts = [x for x in candidates if x["diff"] < 0]
        
        if futures:
            # Sort by Context Score (highest first), then chronologically (earliest first)
            futures.sort(key=lambda x: (-x["ctx"], x["dt"]))
            best = futures[0]
            return best["dt"], best["text"]
            
        # All candidates are past — pick the most recent one
        pasts.sort(key=lambda x: (-x["ctx"], -x["diff"]))
        best = pasts[0]
        return best["dt"], best["text"]

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
            
        if deadline.tzinfo:
            from datetime import timezone
            now = datetime.now(timezone.utc)
            deadline = deadline.astimezone(timezone.utc)
        else:
            now = datetime.now()
            
        diff = (deadline - now).total_seconds() / 3600 # hours
        
        if diff < 0:
            return 0 
            
        if diff < 24:
            # Linear scale: 40 at 0h, 30 at 24h
            return round(30 + (10 * (1 - (diff / 24.0))))
        elif 24 <= diff < 72:
            # 1 to 3 days: 29 down to 15
            days_diff = diff / 24.0
            return round(15 + (14 * (1 - ((days_diff - 1) / 2.0))))
        elif 72 <= diff < 168:
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
                score = 0  # Force overdue emails to score 0 so they always rank at the bottom
            elif diff < 24:
                # Dynamic progressive multiplier: scales from 1.0x (at 24 hrs left) up to 1.5x (at 0 hrs left)
                multiplier = 1.0 + (0.5 * (1 - (diff / 24.0)))
                score *= multiplier
                
        score = min(100, round(score))

        if not is_overdue:
            if score >= 75:
                urgency_label = "High"
            elif score >= 45:
                urgency_label = "Medium"
            else:
                urgency_label = "Low"

        # Compute weight-applied contributions for display
        contrib_deadline = round(raw_deadline / 40 * w["deadline_weight"])
        contrib_sender = round(raw_sender / 30 * w["sender_weight"])
        contrib_complexity = round(raw_complexity / 20 * w["task_weight"])
        contrib_escalation = round(raw_escalation / 10 * w["escalation_weight"])

        factors = {
            # raw is shown as the weighted contribution so UI bars scale correctly with the slider
            "deadline": { "raw": contrib_deadline, "contribution": contrib_deadline, "evidence": deadline_snippet },
            "sender": { "raw": contrib_sender, "contribution": contrib_sender },
            "complexity": { "raw": contrib_complexity, "contribution": contrib_complexity },
            "escalation": { "raw": contrib_escalation, "contribution": contrib_escalation, "evidence": escalation_snippet }
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
    
    # sys.argv[1] = path to settings.json
    # sys.argv[2] = user email key to look up inside that file
    settings_path = sys.argv[1] if len(sys.argv) > 1 else None
    user_email = sys.argv[2] if len(sys.argv) > 2 else None
    
    if settings_path:
        print(f"DEBUG: Using settings file: {settings_path}, user: {user_email or 'default'}", file=sys.stderr)
    else:
        print(f"DEBUG: No settings path provided, using default.", file=sys.stderr)
    
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

    scorer = EmailScorer(settings_path=settings_path, user_email=user_email)
    
    # Handle Batch Input
    if isinstance(data, list):
        results = [scorer.score_email(email) for email in data]
        print(json.dumps(results))
    else:
        result = scorer.score_email(data)
        print(json.dumps(result))
