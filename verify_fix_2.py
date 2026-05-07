
import os
import sys
from datetime import datetime, timezone, timedelta
import json

# Add data dir to path so we can import EmailScorer
sys.path.append(os.path.join(os.getcwd(), "data"))
from scoring_service import EmailScorer

def test_user_scenario():
    scorer = EmailScorer()
    
    # Today is May 8, 2026 6:16 AM
    now = datetime(2026, 5, 8, 6, 16, tzinfo=timezone.utc)
    
    # The problematic email body from cache
    body = "  The Jenkins pipeline is broken. Please fix it\r\nthis on May 8, 2026 by 9:00\r\nPM\r\n"
    
    # Email received today May 8, 2026 5:00 AM
    received_date = "2026-05-08T05:00:00Z"
    
    email = {
        "subject": "Jenkins Pipeline",
        "body": body,
        "from": "build-bot@company.com",
        "date": received_date
    }
    
    # Score the email
    results = scorer.score_emails_batch([email], reference_date=now)
    res = results[0]
    
    print(f"Body: {email['body']}")
    print(f"Deadline Snippet Found: {res['factors']['deadline']['evidence']}")
    print(f"Parsed Deadline: {res['deadline']}")
    print(f"Urgency Label: {res['urgency_label']}")
    print(f"Is Past Due? {'Yes' if res['urgency_label'] == 'Past Due' else 'No'}")
    
if __name__ == "__main__":
    test_user_scenario()
