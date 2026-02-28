import os
from dotenv import load_dotenv

load_dotenv()

JUDGE0_URL               = os.getenv("JUDGE0_URL", "http://localhost:2358")
ADMIN_PASSWORD           = os.getenv("ADMIN_PASSWORD", "changeme")
CONTEST_DURATION_SECONDS = int(os.getenv("CONTEST_DURATION_SECONDS", 3600))
DB_PATH                  = os.getenv("DB_PATH", "contest.db")
SECRET_KEY               = os.getenv("SECRET_KEY", "dev-only-secret")

LANGUAGE_IDS = {
    "python": 71,
    "cpp":    54,
    "c":      50,
    "java":   62,
}