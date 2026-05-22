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

app = FastAPI()

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
                    user_data = data
                    
                    # If this is an old-style multi-user file, extract the specific user
                    if self.user_email and self.user_email in data and isinstance(data[self.user_email], dict):
                        user_data = data[self.user_email]
                    elif "__default__" in data and isinstance(data["__default__"], dict):
                        user_data = data["__default__"]
                    
                    if "weights" in user_data:
                        self.settings["weights"].update(user_data["weights"])
                    if "important_senders" in user_data:
                        self.settings["important_senders"] = user_data["important_senders"]
            except Exception as e:
                pass

    def extract_deadline(self, text, base_date=None, doc=None):
        text_clean = text 
        if doc is None:
            text_clean = re.sub(r'(?i)(\d{1,2})\s*(am|pm)', r'\1 \2', text)
            doc = nlp(text_clean)
            
        ref_now = base_date if base_date else datetime.now(timezone.utc)
        if ref_now.tzinfo is None: ref_now = ref_now.replace(tzinfo=timezone.utc)
        
        # 1. Collect candidates from spaCy entities
        raw_entities = [ent for ent in doc.ents if ent.label_ in ["DATE", "TIME"]]
        merged_deadlines = []
        processed_indices = set()
        
        DEADLINE_INDICATORS = ["by", "before", "due", "deadline", "submit", "no later than", "latest", "until", "send them", "respond", "needed by", "required by", "confirmation by"]
        REFERENCE_INDICATORS = ["on", "scheduled", "taking place", "vacation", "event", "for the month", "since", "from", "last", "for the", "trip", "anniversary", "during", "request for", "for ", "in "]

        for i in range(len(raw_entities)):
            if i in processed_indices: continue
            ent = raw_entities[i]
            combined_text = ent.text
            last_end = ent.end
            curr_idx = i + 1
            while curr_idx < len(raw_entities):
                next_ent = raw_entities[curr_idx]
                between_tokens = doc[last_end:next_ent.start]
                between_text = between_tokens.text.strip().lower()
                if between_text in ["at", "on", "@", "", ",", "-", "by", "before", "this", "until"] or not re.search(r'[a-zA-Z0-9]', between_text):
                    combined_text += " " + between_text + " " + next_ent.text
                    last_end = next_ent.end
                    processed_indices.add(curr_idx)
                    curr_idx += 1
                else: break
            try:
                parse_text = combined_text.lower()
                if "tomorrow" in parse_text:
                    tomorrow_date = (ref_now + timedelta(days=1)).strftime("%Y-%m-%d")
                    parse_text = parse_text.replace("tomorrow", tomorrow_date)
                if "today" in parse_text:
                    today_date = ref_now.strftime("%Y-%m-%d")
                    parse_text = parse_text.replace("today", today_date)
                
                # Default to end of day if no time is found
                dt = parse_date(parse_text, fuzzy=True, default=ref_now.replace(hour=23, minute=59, second=59))
                
                if "end of the day" in combined_text.lower() or "end of day" in combined_text.lower():
                    dt = dt.replace(hour=17, minute=0, second=0)
                
                # If the text explicitly has a time, parse_date will have overridden the 23:59:59 default.
                if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
                
                start_char = max(0, ent.start_char - 50)
                pre_context = text_clean[start_char:ent.start_char].lower()
                
                context_score = 0
                if any(kw in pre_context for kw in DEADLINE_INDICATORS) or any(kw in combined_text.lower() for kw in DEADLINE_INDICATORS): 
                    context_score += 50
                if any(kw in pre_context for kw in REFERENCE_INDICATORS): 
                    context_score -= 50
                if any(kw in combined_text.lower() for kw in ["july", "august", "june", "week of"]) and not any(kw in pre_context for kw in ["by", "before"]):
                    context_score -= 30
                if re.search(r'\d{1,2}(?::\d{2})?\s*(am|pm)', combined_text, re.IGNORECASE): context_score += 10
                
                merged_deadlines.append((dt, combined_text, context_score))
            except: pass

                # 2. Supplemental Regex Extraction (Robust fallback for formats spaCy misses)
        patterns = [
            # Date + optional time (e.g., "May 8, 2026 9:00 PM", "05/08/2026 at 9am", "this on May 8")
            r'\b(?P<val>(?:at|by|on|due|@|this on)?\s*(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,\s*\d{4})?|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?i:today|tomorrow))\s*(?:at|by|on|due|@|this on)?\s*(?:\d{1,2}:\d{2}[\r\n\s]+(?:am|pm)?)?)\b',
            # Time + optional relative (e.g., "9:00 PM today")
            r'\b(?P<val>\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:today|tomorrow|tonight)?)\b',
            # Relative terms
            r'\b(?P<val>within the hour|this afternoon|tonight|today|tomorrow)\b'
        ]
        
        for p in patterns:
            for match in re.finditer(p, text_clean, re.IGNORECASE):
                match_text = match.group("val")
                if not match_text:
                    match_text = match.group(0).strip()
                else:
                    match_text = match_text.strip()
                    
                if not match_text: continue
                # Normalize spaces/newlines for parsing
                normalized_text = re.sub(r'[\r\n\s]+', ' ', match_text)
                
                # Intelligent Overlap Handling... (existing logic)
                is_subset = False
                new_merged = []
                for m_dt, m_text, m_score in merged_deadlines:
                    if m_text.lower() in normalized_text.lower() and m_text.lower() != normalized_text.lower():
                        continue
                    if normalized_text.lower() in m_text.lower():
                        is_subset = True
                        new_merged.append((m_dt, m_text, m_score))
                    else:
                        new_merged.append((m_dt, m_text, m_score))
                
                if is_subset: continue
                merged_deadlines = new_merged
                
                try:
                    parse_text = normalized_text.lower()
                    if "tomorrow" in parse_text:
                        tomorrow_date = (ref_now + timedelta(days=1)).strftime("%Y-%m-%d")
                        parse_text = parse_text.replace("tomorrow", tomorrow_date)
                    if "today" in parse_text:
                        today_date = ref_now.strftime("%Y-%m-%d")
                        parse_text = parse_text.replace("today", today_date)
                    
                    dt = parse_date(parse_text, fuzzy=True, default=ref_now)
                    if "end of the day" in normalized_text.lower() or "end of day" in normalized_text.lower():
                        dt = dt.replace(hour=17, minute=0, second=0)
                    if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
                    
                    # Context for regex match
                    start_pos = max(0, match.start() - 50)
                    pre_context = text_clean[start_pos:match.start()].lower()
                    
                    context_score = 15 # Base for regex
                    if any(kw in pre_context for kw in DEADLINE_INDICATORS): context_score += 40
                    if any(kw in pre_context for kw in REFERENCE_INDICATORS): context_score -= 50
                    
                    merged_deadlines.append((dt, normalized_text, context_score))
                except: pass

        if not merged_deadlines:
            # Approval Request Soft Deadline Logic (Simplified inline)
            if any(kw in text_clean.lower() for kw in ["pto", "vacation", "approval", "approve", "request for"]):
                return base_date + timedelta(hours=24), "24-hour turnaround for approval/PTO request"
            return base_date + timedelta(days=1), "24 hours after receipt (default)"
        
        MONTH_NAMES = {m.lower() for m in calendar.month_name if m} | {m.lower() for m in calendar.month_abbr if m}
        def is_explicit(t_val):
            t = t_val.lower()
            return any(m in t for m in MONTH_NAMES) or re.search(r'\d{1,2}[:/]\d{2}', t) or re.search(r'\d{1,2}\s*(am|pm)', t, re.IGNORECASE) or "today" in t or "tomorrow" in t
            
        valid_candidates = []
        for dt_val, text_val, ctx_score in merged_deadlines:
            diff_hours = (dt_val - ref_now).total_seconds() / 3600
            if ctx_score < -20: continue
            if diff_hours > -8760 and diff_hours < 8760: 
                valid_candidates.append({"dt": dt_val, "text": text_val, "diff": diff_hours, "ctx": ctx_score, "explicit": is_explicit(text_val)})
        
        if not valid_candidates: return base_date + timedelta(days=1), "24 hours after receipt (default)"
        
        explicit = [x for x in valid_candidates if x["explicit"]]
        candidates = explicit if explicit else valid_candidates
        futures = [x for x in candidates if x["diff"] >= 0]
        if futures:
            futures.sort(key=lambda x: (-x["ctx"], x["dt"]))
            return futures[0]["dt"], futures[0]["text"]
            
        candidates.sort(key=lambda x: (-x["ctx"], -x["diff"]))
        return candidates[0]["dt"], candidates[0]["text"]

    def calculate_deadline_score(self, deadline, ref_now=None):
        if not deadline: return 0
        if not ref_now: ref_now = datetime.now(timezone.utc)
        if deadline.tzinfo is None: deadline = deadline.replace(tzinfo=timezone.utc)
        if ref_now.tzinfo is None: ref_now = ref_now.replace(tzinfo=timezone.utc)
        
        diff = (deadline - ref_now).total_seconds() / 3600
        if diff < 0: return 0 
        
        # Deadlines within the next 24 hours get a high score (30-40 range)
        if diff < 24:
            return round(30 + (10 * (1 - (diff / 24.0))))
        # Deadlines within the next week (10-30 range)
        elif diff < 168:
            return round(10 + (20 * (1 - ((diff - 24) / 144.0))))
        # Deadlines within the next month (2-10 range)
        elif diff < 720:
            return round(2 + (8 * (1 - ((diff - 168) / 552.0))))
        return 1

    def calculate_sender_score(self, sender_email, sender_name=""):
        sender_lower = sender_email.lower()
        name_lower = sender_name.lower()
        if any(important.lower() in sender_lower for important in self.settings["important_senders"]):
            matched_vip = next(i for i in self.settings["important_senders"] if i.lower() in sender_lower)
            return 30, f"sender '{matched_vip}' is on your important senders list"
        high_titles = ["ceo", "president", "chairman", "founder", "manager", "director", "vp", "chief", "lead", "head"]
        for title in high_titles:
            if title in name_lower or title in sender_lower:
                return 30, f"sender holds a high-authority title ({title})"
        if ".gov" in sender_lower: return 25, "sender is from a government domain"
        elif ".edu" in sender_lower: return 15, "sender is from an educational domain"
        elif "@" in sender_lower:
            domain = sender_lower.split("@")[-1]
            if domain not in ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com"]: return 15, "sender is from a corporate or custom domain"
            else: return 3, "sender is from a public email domain"
        return 0, None

    def calculate_complexity_score(self, body):
        doc = nlp(body)
        verbs = [token for token in doc if token.pos_ == "VERB"]
        step_keywords = ["step", "first", "second", "third", "finally", "then", "next", "initially", "subsequently", "report", "analysis", "review", "draft", "prepare", "coordinates", "orchestrate", "implement", "execute"]
        steps_count = sum(1 for token in doc if token.text.lower() in step_keywords)
        
        # High structural weight: verbs and step keywords are key indicators
        structural_score = (len(verbs) * 3) + (steps_count * 5)
        
        # Sentiment-based effort check
        res = classifier(body[:512])[0]
        vibe_score = 10 if res['label'] == 'NEGATIVE' and res['score'] > 0.5 else 5
        
        raw_score = structural_score + vibe_score
        
        # Enhanced reason generation
        complexity_reason = None
        if steps_count >= 2: complexity_reason = f"the message outlines a {steps_count}-step process"
        elif len(verbs) >= 5: complexity_reason = "the message requires multiple actions"
        
        # Stricter thresholds for 'Complex' classification
        if raw_score >= 10: return 20, complexity_reason or "the task requires significant effort"
        elif raw_score >= 5: return 14, complexity_reason or "the message involves moderate effort"
        else: return 8, None

    def check_escalation(self, text):
        # Strict binary check
        keywords = ["urgent", "asap", "immediately", "emergency", "action required", "priority", "critical", "important", "deadline", "fast", "disappointed", "overdue", "unhappy", "delay", "following up", "at your earliest", "please advise", "blocked", "incident"]
        
        for kw in keywords:
            if kw in text.lower():
                return 10.0, kw
        return 0.0, ""

    def generate_explanation(self, factors_info):
        reasons = []
        if factors_info["escalation"]["raw"] > 0 and factors_info["escalation"].get("evidence"):
            reasons.append(f"urgent escalation keyword '{factors_info['escalation']['evidence']}' was detected")
        if factors_info["sender"].get("reason"):
            reasons.append(factors_info["sender"]["reason"])
        if factors_info["deadline"].get("evidence"):
            reasons.append(f"an imminent deadline '{factors_info['deadline']['evidence']}' was identified")
        if factors_info["complexity"].get("reason"):
            reasons.append(factors_info["complexity"]["reason"])
            
        if not reasons: return "This message was reviewed and ranked based on standard priority metrics."
        if len(reasons) == 1: return f"This message was prioritized because {reasons[0]}."
        return f"This message was prioritized because {', '.join(reasons[:-1])}, and {reasons[-1]}."

    def score_emails_batch(self, emails, reference_date=None):
        if not emails: return []
        
        # 1. Pre-process texts for batch NLP
        texts = []
        for e in emails:
            subject = e.get("subject", "")
            body = e.get("body", "")
            text = subject + " " + body
            text_clean = re.sub(r'(?i)(\d{1,2})\s*(am|pm)', r'\1 \2', text)
            texts.append(text_clean)
            
        # 2. Batch NLP: spaCy pipe (faster than nlp(text) in a loop)
        docs = list(nlp.pipe(texts))
        
        # 3. Batch NLP: Transformers (faster with batch_size)
        # We only need bodies for complexity score, let's truncate to 512 for speed
        bodies = [e.get("body", "")[:512] for e in emails]
        vibe_results = classifier(bodies, batch_size=len(emails))
        
        # 4. Process each email using pre-calculated NLP results
        results = []
        for i, email_data in enumerate(emails):
            try:
                subject = email_data.get("subject", "")
                body = email_data.get("body", "")
                sender_email = email_data.get("from") or email_data.get("sender") or ""
                sender_name = email_data.get("sender_name") or ""
                received_date_str = email_data.get("date")
                
                fallback_now = reference_date if reference_date else datetime.now(timezone.utc)
                if fallback_now.tzinfo is None: fallback_now = fallback_now.replace(tzinfo=timezone.utc)
                
                base_date = fallback_now
                if received_date_str:
                    try:
                        base_date = parse_date(received_date_str)
                        if base_date.tzinfo is None: base_date = base_date.replace(tzinfo=timezone.utc)
                    except: pass
                
                real_now = fallback_now
                
                # Pass pre-calculated doc to extract_deadline
                deadline, deadline_snippet = self.extract_deadline(texts[i], base_date=base_date, doc=docs[i])
                
                is_past_due = False
                urgency_label = "Low"
                diff_seconds = (real_now - deadline).total_seconds() if deadline else 86400 # 1 day default
                
                if deadline and diff_seconds > 0:
                    is_past_due = True
                    days_overdue = diff_seconds / 86400
                    if days_overdue <= 1: raw_deadline = 40.0
                    elif days_overdue <= 7: raw_deadline = 35.0
                    else: raw_deadline = max(20.0, 30.0 - (days_overdue - 7) * 0.3)
                else:
                    raw_deadline = self.calculate_deadline_score(deadline, ref_now=real_now)

                raw_sender, sender_reason = self.calculate_sender_score(sender_email, sender_name)
                
                # Escalation & Complexity (Using centralized methods above)
                raw_escalation, escalation_snippet = self.check_escalation(texts[i])
                if is_past_due and raw_escalation == 0:
                    raw_escalation = 10.0
                    escalation_snippet = "past due deadline"
                
                raw_complexity, complexity_reason = self.calculate_complexity_score(body)
                
                w = self.settings["weights"]
                score = (raw_deadline / 40.0 * w["deadline_weight"]) + \
                        (raw_sender / 30.0 * w["sender_weight"]) + \
                        (raw_complexity / 20.0 * w["task_weight"]) + \
                        (raw_escalation / 10.0 * w["escalation_weight"])
                score = min(100, round(score))
                
                if not is_past_due:
                    urgency_label = "High" if score >= 80 else "Medium" if score >= 50 else "Low"
                else:
                    urgency_label = "Past Due"
                
                factors = {
                    "deadline": { "raw": raw_deadline, "evidence": deadline_snippet },
                    "sender": { "raw": raw_sender, "reason": sender_reason },
                    "complexity": { "raw": raw_complexity, "reason": complexity_reason },
                    "escalation": { "raw": raw_escalation, "evidence": escalation_snippet }
                }
                classification = { 
                    "sender": "High" if raw_sender >= 25 else "Medium" if raw_sender >= 15 else "Low", 
                    "complexity": "Complex" if raw_complexity >= 16 else "Moderate" if raw_complexity >= 5 else "Simple" 
                }
                results.append({ 
                    "total_score": score, 
                    "urgency_label": urgency_label, 
                    "factors": factors, 
                    "deadline": deadline.isoformat() if deadline else None, 
                    "classification": classification, 
                    "explanation": self.generate_explanation(factors) 
                })
            except Exception as e:
                results.append({ "total_score": 0, "urgency_label": "Low", "factors": {}, "error": str(e) })
        return results

    def score_email(self, email_data, reference_date=None):
        # Fallback to batch method for single email
        return self.score_emails_batch([email_data], reference_date=reference_date)[0]

class PrioritizeRequest(BaseModel):
    emails: Union[List[Dict[str, Any]], Dict[str, Any]]
    settings_path: Optional[str] = None
    user_email: Optional[str] = None
    reference_date: Optional[str] = None

@app.post("/prioritize")
async def prioritize(req: PrioritizeRequest):
    scorer = EmailScorer(settings_path=req.settings_path, user_email=req.user_email)
    ref_date = None
    if req.reference_date:
        try:
            ref_date = parse_date(req.reference_date)
            if ref_date.tzinfo is None: ref_date = ref_date.replace(tzinfo=timezone.utc)
        except:
            pass
            
    if isinstance(req.emails, list): return scorer.score_emails_batch(req.emails, reference_date=ref_date)
    return scorer.score_email(req.emails, reference_date=ref_date)

@app.get("/health")
async def health(): return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
