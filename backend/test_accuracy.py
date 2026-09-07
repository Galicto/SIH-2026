import pandas as pd
import requests
import io

df = pd.read_csv('../arthniti_transactions_50.csv')

# The backend expects: date,description,amount (columns 0,1,2)
# But the CSV has: description,amount,type,category,priority
# We need to restructure it to match what the backend expects
test_df = pd.DataFrame({
    'date': ['2026-05-01'] * len(df),
    'description': df['description'],
    'amount': df['amount']
})

# Send to backend for AI categorization
csv_str = test_df.to_csv(index=False)
files = {'file': ('test.csv', io.BytesIO(csv_str.encode()), 'text/csv')}
r = requests.post('http://localhost:8000/api/upload-expenses', files=files)
data = r.json()

# Compare
correct = 0
wrong = 0
for row in data.get('data', []):
    original = df[df['description'] == row['description']]['category'].values
    if len(original) > 0:
        orig_cat = original[0]
        ai_cat = row['ai_category']
        if orig_cat.lower() == ai_cat.lower():
            correct += 1
            print(f"  OK   : {row['description']:30s} -> {ai_cat}")
        else:
            wrong += 1
            print(f"  WRONG: {row['description']:30s} expected={orig_cat:15s} got={ai_cat}")

print(f"\nTotal: {correct+wrong}, Correct: {correct}, Wrong: {wrong}, Accuracy: {correct/(correct+wrong)*100:.1f}%")
