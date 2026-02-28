import json
import os

_PROBLEMS = None


def load_problems():
    global _PROBLEMS
    with open(os.path.join("data", "problems_fake.json")) as f:
        _PROBLEMS = json.load(f)


def get_all_problems():
    if _PROBLEMS is None:
        load_problems()
    return _PROBLEMS


def get_problem(pid):
    for p in get_all_problems():
        if p["id"] == pid:
            return p
    return None


def get_safe_problems():
    """Strip hidden_main and hidden_test_cases before sending to client."""
    return [
        {
            "id":                p["id"],
            "title":             p["title"],
            "subtitle":          p["subtitle"],
            "description":       p["description"],
            "input_format":      p["input_format"],
            "output_format":     p["output_format"],
            "constraints":       p.get("constraints", ""),
            "visible_test_cases": p["visible_test_cases"],
            "boilerplate":       p["boilerplate"],
        }
        for p in get_all_problems()
    ]