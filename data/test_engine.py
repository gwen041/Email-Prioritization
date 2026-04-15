import json
import subprocess
import sys

def test_batch():
    emails = [
        {"subject": "Urgent Meeting", "body": "We need to meet ASAP about the project.", "from": "boss@enron.com"},
        {"subject": "Coffee tomorrow?", "body": "Hey, do you want to grab coffee?", "from": "friend@gmail.com"}
    ]
    
    # Run the scoring engine with batch input
    process = subprocess.Popen(
        [sys.executable, 'scoring_engine.py'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding='utf-8'
    )
    
    stdout, stderr = process.communicate(input=json.dumps(emails))
    
    print("STDOUT:", stdout)
    print("STDERR:", stderr)
    
    try:
        results = json.loads(stdout)
        print(f"Success! Received {len(results)} results.")
        for i, res in enumerate(results):
            print(f"Result {i+1}: {res['total_score']} - {res['classification']}")
    except Exception as e:
        print("Failed to parse results:", e)

if __name__ == "__main__":
    test_batch()
