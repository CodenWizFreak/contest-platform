import sqlite3
from core.config import DB_PATH


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS contest_config (
                key   TEXT PRIMARY KEY,
                value TEXT
            );
            CREATE TABLE IF NOT EXISTS participants (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                name          TEXT    NOT NULL,
                college       TEXT    NOT NULL,
                system_number TEXT    NOT NULL,
                phone         TEXT    NOT NULL,
                login_time    TEXT,
                submitted     INTEGER DEFAULT 0,
                submit_time   TEXT,
                UNIQUE(phone)
            );
            CREATE TABLE IF NOT EXISTS submissions (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                participant_id     INTEGER,
                problem_id         INTEGER,
                language           TEXT,
                code               TEXT,
                passed_all         INTEGER DEFAULT 0,
                wrong_attempts     INTEGER DEFAULT 0,
                first_opened_at    TEXT,
                solved_at          TEXT,
                time_taken_seconds REAL,
                last_updated       TEXT,
                FOREIGN KEY(participant_id) REFERENCES participants(id)
            );
            CREATE TABLE IF NOT EXISTS solved (
                participant_id INTEGER,
                problem_id     INTEGER,
                PRIMARY KEY(participant_id, problem_id)
            );
        """)
        conn.execute("INSERT OR IGNORE INTO contest_config VALUES ('start_time', '')")
        conn.execute("INSERT OR IGNORE INTO contest_config VALUES ('contest_active', '0')")
        conn.commit()


def get_config(key):
    with get_db() as conn:
        row = conn.execute("SELECT value FROM contest_config WHERE key=?", (key,)).fetchone()
        return row["value"] if row else ""


def set_config(key, value):
    with get_db() as conn:
        conn.execute("INSERT OR REPLACE INTO contest_config VALUES (?,?)", (key, value))
        conn.commit()