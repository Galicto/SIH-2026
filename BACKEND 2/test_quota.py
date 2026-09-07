import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

models_to_test = [
    "models/gemini-1.5-flash",
    "models/gemini-1.5-flash-8b",
    "models/gemini-2.0-flash-lite-preview-02-05",
    "models/gemini-2.0-flash-lite",
    "models/gemini-flash-latest"
]

for m in models_to_test:
    try:
        model = genai.GenerativeModel(m)
        response = model.generate_content("Hi", generation_config={"max_output_tokens": 10})
        print(f"{m}: SUCCESS")
    except Exception as e:
        print(f"{m}: FAILED - {e}")
