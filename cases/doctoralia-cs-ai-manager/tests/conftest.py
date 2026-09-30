"""Put src/ on sys.path the same way the scripts do (sys.path.insert(0, <src>))."""
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))
