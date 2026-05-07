
import re
from datetime import datetime
from dateutil.parser import parse as parse_date

text = "The Jenkins pipeline is broken. Please fix it\r\nthis on May 8, 2026 by 9:00\r\nPM\r\n"

# The specific regex being used
p = r'\b(?P<val>(?:at|by|on|due|@|this on)?\s*(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,\s*\d{4})?|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?i:today|tomorrow))\s*(?:at|by|on|due|@|this on)?\s*(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:today|tomorrow|tonight)?)\b'

# Need to clean text like the scoring service
# The scoring service does: re.sub(r'(?i)(\d{1,2})\s*(am|pm)', r'\1 \2', text)
text_clean = re.sub(r'(?i)(\d{1,2})\s*(am|pm)', r'\1 \2', text)

match = re.search(p, text_clean, re.IGNORECASE)
print(f"Match found: {match.group('val') if match else 'None'}")
