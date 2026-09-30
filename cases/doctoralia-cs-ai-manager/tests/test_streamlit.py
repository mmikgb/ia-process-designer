"""
The Streamlit app renders every screen in both roles without an exception.

Needs a built bundle (python3 src/bundle.py). Run: pytest tests/test_streamlit.py
"""
from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

APP = Path(__file__).resolve().parent.parent / "src" / "app.py"
SCREENS = {
    "Specialist": ["Overview", "My day", "Watchlist", "Doctor", "Data & settings"],
    "Manager": ["Overview", "My team", "Control", "Watchlist", "Cost", "Doctor", "Data & settings"],
}
CASES = [(role, screen) for role, screens in SCREENS.items() for screen in screens]


@pytest.mark.parametrize("role,screen", CASES, ids=[f"{r}-{s}" for r, s in CASES])
def test_screen_renders(role, screen):
    at = AppTest.from_file(str(APP), default_timeout=120).run()
    # The sidebar radios have no keys: [0] is "View as", [1] is the screen list.
    at.sidebar.radio[0].set_value(role).run()
    at.sidebar.radio[1].set_value(screen).run()
    assert not at.exception, [e.value for e in at.exception]


def test_twelve_screens():
    assert len(CASES) == 12
