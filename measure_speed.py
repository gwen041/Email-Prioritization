import time
import os
import sys
import json

# Add data dir to path
sys.path.append(os.path.join(os.getcwd(), 'data'))
from scoring_service import EmailScorer

def run_test():
    print("Loading models...")
    scorer = EmailScorer()
    
    # Load actual emails from cache
    cache_path = os.path.join(os.getcwd(), 'backend', 'cache', 'franzdirk215_gmail_com.json')
    try:
        with open(cache_path, 'r', encoding='utf-8') as f:
            emails = json.load(f)
    except Exception as e:
        print(f"Failed to load cache: {e}")
        return

    print(f"Loaded {len(emails)} emails from cache.")
    
    # We will score all of them at once
    print(f"Scoring {len(emails)} emails...")
    start = time.time()
    results = scorer.score_emails_batch(emails)
    end = time.time()
    
    total_time = end - start
    avg_time_ms = (total_time / len(emails)) * 1000
    
    print(f"Total time for {len(emails)} emails: {total_time:.3f}s")
    print(f"Average processing time per email: {avg_time_ms:.1f}ms")

if __name__ == '__main__':
    run_test()
