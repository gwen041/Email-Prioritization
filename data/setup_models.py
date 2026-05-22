import os
import spacy
import sys
from transformers import AutoTokenizer, AutoModelForSequenceClassification

def setup():
    print("--- AI Model Setup ---")
    data_dir = os.path.dirname(os.path.abspath(__file__))
    model_dir = os.path.join(data_dir, "models", "distilbert")
    
    if not os.path.exists(model_dir):
        os.makedirs(model_dir, exist_ok=True)
    print("Checking spaCy model (en_core_web_sm)...")
    try:
        spacy.load("en_core_web_sm")
        print("[OK] spaCy model already exists.")
    except:
        print("Downloading spaCy model...")
        import subprocess
        subprocess.run([sys.executable, "-m", "spacy", "download", "en_core_web_sm"])
        print("[OK] spaCy model downloaded.")
    print(f"Downloading DistilBERT to {model_dir}...")
    model_name = "distilbert-base-uncased-finetuned-sst-2-english"
    
    try:
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSequenceClassification.from_pretrained(model_name)
        
        tokenizer.save_pretrained(model_dir)
        model.save_pretrained(model_dir)
        print("[OK] DistilBERT saved locally.")
    except Exception as e:
        print(f"[ERROR] Failed to download DistilBERT: {e}")
        sys.exit(1)

    print("--- Setup Complete ---")

if __name__ == "__main__":
    setup()
