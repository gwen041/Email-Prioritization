import sys
import os
import unittest
from datetime import datetime, timedelta, timezone
from dateutil.parser import parse as parse_date
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scoring_service import EmailScorer

class TestScoring(unittest.TestCase):
    def setUp(self):
        self.scorer = EmailScorer()
        self.pht = timezone(timedelta(hours=8))

    def test_past_due_bug_repro(self):
        ref_now = datetime(2026, 5, 22, 20, 46, 0, tzinfo=self.pht)
        
        email_text = """
        Security operations flagged an active encryption script in the HR file
        share directory this afternoon. All infrastructure engineers must
        immediately isolate the affected subnets to secure company assets by 10:00
        PM today, May 22, 2026.
        """
        
        email_data = {
            "subject": "URGENT: Active Encryption Script Detected",
            "body": email_text,
            "from": "almiratabios01@gmail.com",
            "sender_name": "Almira Tabios",
            "date": "2026-05-22T20:00:00+08:00"
        }
        
        result = self.scorer.score_email(email_data, reference_date=ref_now.isoformat())
        
        self.assertNotIn('error', result)
        self.assertNotEqual(result['urgency_label'], "Past Due", "Email should not be marked as Past Due")
        self.assertTrue("10:00 PM" in result['factors']['deadline']['evidence'], "Should pick 10:00 PM as deadline")
        deadline = parse_date(result['deadline'])
        self.assertEqual(deadline.hour, 22)
        self.assertEqual(deadline.day, 22)
        self.assertEqual(deadline.month, 5)
        self.assertEqual(deadline.year, 2026)

    def test_time_and_date_deadline_is_past_due_after_time_passes(self):
        ref_now = datetime(2026, 5, 22, 20, 46, 0, tzinfo=self.pht)
        email_data = {
            "subject": "OAuth gateway emergency",
            "body": (
                "The main OAuth gateway is completely unresponsive this afternoon, blocking "
                "all customer logins globally. We must run a container rollback and clear "
                "the cluster cache by 5:30 PM today, May 22, 2026, to restore user access."
            ),
            "from": "ops@company.com",
            "date": "2026-05-22T12:00:00+08:00"
        }

        result = self.scorer.score_email(email_data, reference_date=ref_now.isoformat())

        self.assertNotIn('error', result)
        self.assertEqual(result['urgency_label'], "Past Due")
        self.assertIn("5:30 PM", result['factors']['deadline']['evidence'])

        deadline = parse_date(result['deadline'])
        self.assertEqual(deadline.hour, 17)
        self.assertEqual(deadline.minute, 30)
        self.assertEqual(deadline.day, 22)

    def test_date_only_deadline_not_past_due(self):
        ref_now = datetime(2026, 5, 22, 14, 0, 0, tzinfo=self.pht)
        email_data = {
            "subject": "Task for today",
            "body": "Please finish this by today.",
            "from": "boss@company.com",
            "date": "2026-05-22T10:00:00+08:00"
        }
        
        result = self.scorer.score_email(email_data, reference_date=ref_now.isoformat())
        self.assertNotEqual(result['urgency_label'], "Past Due")
        
        deadline = parse_date(result['deadline'])
        self.assertEqual(deadline.hour, 23)
        self.assertEqual(deadline.minute, 59)

if __name__ == "__main__":
    unittest.main()
