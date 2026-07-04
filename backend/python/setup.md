# Navigate to python directory
cd backend/python

# Create a virtual environment
py -3.12 -m venv .venv #Windows
python3.12 -m venv .venv #macOS/Linux

# Activate the virtual environment
.venv/Scripts/activate   # Windows
source .venv/bin/activate      # macOS/Linux

# Install dependencies
pip install -r requirements.txt   # Windows/macOS/Linux
