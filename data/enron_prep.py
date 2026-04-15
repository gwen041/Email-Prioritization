import pandas as pd
import re
import json
import os
from datetime import datetime
import email
from email import policy

# Paths
CSV_PATH = 'dataset/emails.csv' # Relative to data/
TITLES_PATH = 'employee_titles.json'
OUTPUT_PATH = 'enron_demo_50.json'

# Urgency Keywords
HIGH_KEYWORDS = ['urgent', 'asap', 'immediately', 'important', 'action required', 'emergency', 'deadline', 'priority']
MEDIUM_KEYWORDS = ['meeting', 'review', 'plan', 'report', 'project', 'update', 'status', 'attached', 'forwarded']

def clean_date(date_str):
    try:
        # Enron dates are often like "Mon, 14 May 2001 16:39:00 -0700 (PDT)"
        # We want to remove the (PDT) part if it exists for dateutil or similar
        date_str = re.sub(r'\s*\([^)]+\)', '', date_str)
        dt = pd.to_datetime(date_str, utc=True)
        # Validation: Remove suspicious years (1970, 2044)
        if dt.year < 1990 or dt.year > 2010:
            return None
        return dt.isoformat()
    except:
        return None

def parse_raw_message(raw_msg):
    msg = email.message_from_string(raw_msg, policy=policy.default)
    headers = dict(msg.items())
    
    # Extract body
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                body += str(part.get_content())
    else:
        body = str(msg.get_content())
        
    return {
        "from": headers.get("From", ""),
        "subject": headers.get("Subject", ""),
        "date": headers.get("Date", ""),
        "body": body.strip()
    }

def main():
    print("Loading employee titles...")
    with open(TITLES_PATH, 'r') as f:
        titles = json.load(f)

    print(f"Loading {CSV_PATH} (sampling first 10,000 for efficiency)...")
    # We only need a subset to find our 50 candidates
    df = pd.read_csv(CSV_PATH, nrows=10000)
    
    selected_emails = []
    counts = {"High": 0, "Medium": 0, "Low": 0}
    
    print("Processing and sampling...")
    for i, row in df.iterrows():
        try:
            parsed = parse_raw_message(row['message'])
            cleaned_dt = clean_date(parsed['date'])
            if not cleaned_dt:
                continue
                
            parsed['date'] = cleaned_dt
            parsed['id'] = f"enron_{i}"
            
            # Step 2: Sender Normalization & Title Mapping
            sender_email = parsed['from'].lower()
            parsed['sender_title'] = titles.get(sender_email, "Employee")
            
            # Step 3 & 4: Stratified Sampling & Ground Truth Labeling
            subject = parsed['subject'].lower()
            body = parsed['body'].lower()
            text = subject + " " + body
            
            ground_truth = "Low"
            if any(kw in text for kw in HIGH_KEYWORDS):
                ground_truth = "High"
            elif any(kw in text for kw in MEDIUM_KEYWORDS):
                ground_truth = "Medium"
                
            # Stratified limit for demo
            if ground_truth == "High" and counts["High"] < 15:
                parsed["ground_truth"] = "High"
                selected_emails.append(parsed)
                counts["High"] += 1
            elif ground_truth == "Medium" and counts["Medium"] < 15:
                parsed["ground_truth"] = "Medium"
                selected_emails.append(parsed)
                counts["Medium"] += 1
            elif ground_truth == "Low" and counts["Low"] < 20:
                parsed["ground_truth"] = "Low"
                selected_emails.append(parsed)
                counts["Low"] += 1
                
            if len(selected_emails) >= 50:
                break
        except Exception as e:
            continue

    print(f"Final Count: {len(selected_emails)}")
    print(f"Distribution: {counts}")
    
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(selected_emails, f, indent=4)
    print(f"Exported to {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
