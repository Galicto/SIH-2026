import pickle
import os

path = r"c:\Users\md meraj ansari\Athniti-finance-expert\backend\label_encoder.pkl"
with open(path, "rb") as f:
    le = pickle.load(f)
    print(list(le.classes_))
