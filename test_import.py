import sys
try:
    import app.main
    print("Successfully imported app.main")
except Exception as e:
    import traceback
    traceback.print_exc()
