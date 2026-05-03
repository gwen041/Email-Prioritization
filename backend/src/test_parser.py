from dateutil.parser import parse as parse_date
from datetime import datetime, timezone
import calendar

def test_parse():
    ref_now = datetime(2026, 5, 4, 4, 33, tzinfo=timezone.utc)
    texts = ["April 17", "Apr 29", "April 17th", "April 29th"]
    
    for text in texts:
        try:
            dt = parse_date(text, fuzzy=True, default=ref_now)
            print(f"Text: '{text}' -> Result: {dt} (Year: {dt.year}, Month: {dt.month}, Day: {dt.day})")
            if dt > ref_now:
                print(f"  WARNING: {dt} is in the FUTURE compared to {ref_now}")
        except Exception as e:
            print(f"Text: '{text}' -> Error: {e}")

if __name__ == "__main__":
    test_parse()
