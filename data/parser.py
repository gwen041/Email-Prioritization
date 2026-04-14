import os
import email
from email import policy
import pandas as pd

def parse_email(filepath):
    # 'errors="replace"' handles old non-standard characters in 20-year-old emails
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        raw = f.read()

    msg = email.message_from_string(raw, policy=policy.default)

    # Extract body text
    if msg.is_multipart():
        body = ""
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                body += str(part.get_content())
    else:
        body = str(msg.get_content())

    return {
        "sender":      msg.get("From", ""),
        "subject":     msg.get("Subject", ""),
        "body":        body.strip(),
        "date":        msg.get("Date", ""),
        "message_id":  msg.get("Message-ID", ""),
        "in_reply_to": msg.get("In-Reply-To", ""),
        "recipients":  msg.get("To", "") + " " + msg.get("CC", ""),
        "folder":      os.path.basename(os.path.dirname(filepath))
    }

def parse_all_emails(maildir_path):
    emails = []
    count = 0
    print("Starting extraction... this will take a while.")
    
    for root, dirs, files in os.walk(maildir_path):
        for filename in files:
            filepath = os.path.join(root, filename)
            try:
                parsed = parse_email(filepath)
                emails.append(parsed)
                count += 1
                # Print progress every 10,000 emails so you know it hasn't crashed
                if count % 10000 == 0:
                    print(f"Parsed {count} emails...")
            except Exception as e:
                pass 
    return emails

# Execute
if __name__ == "__main__":
    emails_data = parse_all_emails("maildir/")
    df = pd.DataFrame(emails_data)
    df.to_csv("enron_parsed.csv", index=False)
    print(f"\n✅ Done! Total parsed: {len(df)} emails.")
    print("Saved to enron_parsed.csv")