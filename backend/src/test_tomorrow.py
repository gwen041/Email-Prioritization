from dateutil.parser import parse as parse_date
from datetime import datetime, timezone

def test_parse():
    ref_now = datetime(2026, 5, 4, 5, 15, tzinfo=timezone.utc)
    texts = ["tomorrow, May 5th", "May 5th", "end of the day tomorrow", "tomorrow"]
    
    for text in texts:
        try:
            dt = parse_date(text, fuzzy=True, default=ref_now)
            print(f"Text: '{text}' -> Result: {dt}")
        except Exception as e:
            print(f"Text: '{text}' -> Error: {e}")

if __name__ == "__main__":
    test_parse()
