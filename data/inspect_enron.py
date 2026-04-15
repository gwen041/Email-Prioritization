import pandas as pd
import re
import os

csv_path = 'c:/github_projects/email-prioritization/data/dataset/emails.csv'

def get_email_info(msg):
    # Extract From, Subject, and Body
    from_match = re.search(r'^From: (.*)$', msg, re.MULTILINE)
    subject_match = re.search(r'^Subject: (.*)$', msg, re.MULTILINE)
    body_match = re.search(r'\n\n(.*)', msg, re.DOTALL)
    
    sender = from_match.group(1).strip() if from_match else ""
    subject = subject_match.group(1).strip() if subject_match else ""
    body = body_match.group(1).strip() if body_match else ""
    return sender, subject, body

print(f"Loading {csv_path}...")
# Sampling 500 rows to find candidates
df = pd.read_csv(csv_path, nrows=500)

results = []
for i, row in df.iterrows():
    sender, subject, body = get_email_info(row['message'])
    results.append({
        'id': i,
        'sender': sender,
        'subject': subject,
        'body_preview': body[:100] + "..."
    })

results_df = pd.DataFrame(results)
print(results_df.head(20))
