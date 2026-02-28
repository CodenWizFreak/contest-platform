from flask import Blueprint, request, jsonify, render_template, session, redirect, url_for
from datetime import datetime, timezone
from core.database import get_db, get_config
from core.problems  import get_safe_problems, get_problem
from core.config    import CONTEST_DURATION_SECONDS
from routes.judge   import run_code_on_judge, build_full_code, parse_result, normalize_expected, best_error

participant_bp = Blueprint("participant", __name__)


# ── PAGES ─────────────────────────────────────────────────────────────────────

@participant_bp.route("/")
def index():
    if "participant_id" in session:
        return redirect(url_for("participant.contest"))
    return render_template("register.html")


@participant_bp.route("/contest")
def contest():
    if "participant_id" not in session:
        return redirect(url_for("participant.index"))
    with get_db() as conn:
        p = conn.execute("SELECT submitted FROM participants WHERE id=?",
                         (session["participant_id"],)).fetchone()
        if p and p["submitted"]:
            return redirect(url_for("participant.ended"))
    return render_template("contest.html", participant_name=session.get("participant_name", ""))


@participant_bp.route("/ended")
def ended():
    return render_template("ended.html")


# ── REGISTER ──────────────────────────────────────────────────────────────────

@participant_bp.route("/register", methods=["POST"])
def register():
    data          = request.json
    name          = data.get("name", "").strip()
    college       = data.get("college", "").strip()
    system_number = data.get("system_number", "").strip()
    phone         = data.get("phone", "").strip()

    if not all([name, college, system_number, phone]):
        return jsonify({"error": "All fields are required."}), 400
    if get_config("contest_active") != "1":
        return jsonify({"error": "Contest has not started yet. Please wait."}), 403

    with get_db() as conn:
        existing = conn.execute("SELECT * FROM participants WHERE phone=?", (phone,)).fetchone()
        if existing:
            if existing["submitted"]:
                return jsonify({"error": "You have already submitted and ended the test."}), 403
            session["participant_id"]   = existing["id"]
            session["participant_name"] = existing["name"]
            return jsonify({"success": True})

        cur = conn.execute(
            "INSERT INTO participants (name, college, system_number, phone, login_time) VALUES (?,?,?,?,?)",
            (name, college, system_number, phone, _now()),
        )
        conn.commit()
        session["participant_id"]   = cur.lastrowid
        session["participant_name"] = name

    return jsonify({"success": True})


# ── STATUS / PROBLEMS ─────────────────────────────────────────────────────────

@participant_bp.route("/api/contest_status")
def contest_status():
    force_ended = False
    if "participant_id" in session:
        with get_db() as conn:
            p = conn.execute("SELECT submitted FROM participants WHERE id=?",
                             (session["participant_id"],)).fetchone()
            if p and p["submitted"]:
                force_ended = True
    return jsonify({
        "active":      get_config("contest_active") == "1",
        "start_time":  get_config("start_time"),
        "duration":    CONTEST_DURATION_SECONDS,
        "force_ended": force_ended,
    })


@participant_bp.route("/api/problems")
def api_problems():
    if "participant_id" not in session:
        return jsonify({"error": "Not logged in"}), 401
    return jsonify(get_safe_problems())


@participant_bp.route("/api/solved")
def api_solved():
    if "participant_id" not in session:
        return jsonify([])
    with get_db() as conn:
        rows = conn.execute("SELECT problem_id FROM solved WHERE participant_id=?",
                            (session["participant_id"],)).fetchall()
    return jsonify([r["problem_id"] for r in rows])


@participant_bp.route("/api/open_problem", methods=["POST"])
def open_problem():
    if "participant_id" not in session:
        return jsonify({"ok": False})
    pid            = int(request.json.get("problem_id", 0))
    participant_id = session["participant_id"]
    now            = _now()
    with get_db() as conn:
        exists = conn.execute(
            "SELECT id FROM submissions WHERE participant_id=? AND problem_id=?",
            (participant_id, pid),
        ).fetchone()
        if not exists:
            conn.execute(
                "INSERT INTO submissions (participant_id, problem_id, language, code, passed_all, wrong_attempts, first_opened_at, last_updated) VALUES (?,?,?,?,0,0,?,?)",
                (participant_id, pid, "python", "", now, now),
            )
            conn.commit()
    return jsonify({"ok": True})


# ── RUN ───────────────────────────────────────────────────────────────────────

@participant_bp.route("/api/run", methods=["POST"])
def api_run():
    if "participant_id" not in session:
        return jsonify({"error": "Not logged in"}), 401

    data           = request.json
    problem_id     = int(data.get("problem_id", 0))
    participant_id = session["participant_id"]

    with get_db() as conn:
        if conn.execute("SELECT 1 FROM solved WHERE participant_id=? AND problem_id=?",
                        (participant_id, problem_id)).fetchone():
            return jsonify({"error": "Already solved"}), 403

    language  = data.get("language", "")
    user_code = data.get("code", "")
    problem   = get_problem(problem_id)
    if not problem:
        return jsonify({"error": "Problem not found"}), 404

    full_code = build_full_code(problem, language, user_code)
    results   = []
    for tc in problem["visible_test_cases"]:
        out    = run_code_on_judge(full_code, language, tc["input"])
        stdout = out.get("stdout") or ""
        parsed = parse_result(stdout)
        exp    = normalize_expected(tc["expected"])
        passed = parsed == exp
        got    = "\n".join(parsed) if parsed else (best_error(out) or "(no output — did your function return a value?)")
        results.append({
            "input":       tc["input"],
            "expected":    tc["expected"],
            "got":         got,
            "passed":      passed,
            "explanation": tc.get("explanation", ""),
        })
    return jsonify({"results": results})


# ── SUBMIT ────────────────────────────────────────────────────────────────────

@participant_bp.route("/api/submit", methods=["POST"])
def api_submit():
    if "participant_id" not in session:
        return jsonify({"error": "Not logged in"}), 401

    data           = request.json
    problem_id     = int(data.get("problem_id", 0))
    language       = data.get("language", "")
    user_code      = data.get("code", "")
    active_seconds = float(data.get("active_seconds", 0) or 0)
    participant_id = session["participant_id"]

    with get_db() as conn:
        if conn.execute("SELECT 1 FROM solved WHERE participant_id=? AND problem_id=?",
                        (participant_id, problem_id)).fetchone():
            return jsonify({"error": "Already solved"}), 403

    problem = get_problem(problem_id)
    if not problem:
        return jsonify({"error": "Problem not found"}), 404

    full_code = build_full_code(problem, language, user_code)
    all_tcs   = problem["visible_test_cases"] + problem["hidden_test_cases"]
    all_passed = True
    results    = []

    for tc in all_tcs:
        out    = run_code_on_judge(full_code, language, tc["input"])
        stdout = out.get("stdout") or ""
        parsed = parse_result(stdout)
        exp    = normalize_expected(tc["expected"])
        passed = parsed == exp
        if not passed:
            all_passed = False
        got = "\n".join(parsed) if parsed else (best_error(out) or "(no output — did your function return a value?)")
        results.append({"expected": tc["expected"], "got": got, "passed": passed})

    now = _now()
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id, wrong_attempts FROM submissions WHERE participant_id=? AND problem_id=?",
            (participant_id, problem_id),
        ).fetchone()

        if existing:
            sub_id = existing["id"]
            wrong  = existing["wrong_attempts"] or 0
            if all_passed:
                conn.execute(
                    "UPDATE submissions SET language=?, code=?, passed_all=1, solved_at=?, time_taken_seconds=?, last_updated=? WHERE id=?",
                    (language, user_code, now, active_seconds, now, sub_id),
                )
                conn.execute("INSERT OR IGNORE INTO solved (participant_id, problem_id) VALUES (?,?)",
                             (participant_id, problem_id))
            else:
                conn.execute(
                    "UPDATE submissions SET language=?, code=?, wrong_attempts=?, last_updated=? WHERE id=?",
                    (language, user_code, wrong + 1, now, sub_id),
                )
        else:
            if all_passed:
                conn.execute(
                    "INSERT INTO submissions (participant_id, problem_id, language, code, passed_all, wrong_attempts, first_opened_at, solved_at, time_taken_seconds, last_updated) VALUES (?,?,?,?,1,0,?,?,?,?)",
                    (participant_id, problem_id, language, user_code, now, now, active_seconds, now),
                )
                conn.execute("INSERT OR IGNORE INTO solved (participant_id, problem_id) VALUES (?,?)",
                             (participant_id, problem_id))
            else:
                conn.execute(
                    "INSERT INTO submissions (participant_id, problem_id, language, code, passed_all, wrong_attempts, first_opened_at, last_updated) VALUES (?,?,?,?,0,1,?,?)",
                    (participant_id, problem_id, language, user_code, now, now),
                )
        conn.commit()

    return jsonify({"all_passed": all_passed, "results": results})


# ── SAVE / END ────────────────────────────────────────────────────────────────

@participant_bp.route("/api/save_code", methods=["POST"])
def save_code():
    if "participant_id" not in session:
        return jsonify({"ok": False})
    data           = request.json
    problem_id     = int(data.get("problem_id", 0))
    language       = data.get("language", "")
    user_code      = data.get("code", "")
    participant_id = session["participant_id"]
    now            = _now()
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM submissions WHERE participant_id=? AND problem_id=?",
            (participant_id, problem_id),
        ).fetchone()
        if existing:
            conn.execute("UPDATE submissions SET language=?, code=?, last_updated=? WHERE id=?",
                         (language, user_code, now, existing["id"]))
        else:
            conn.execute(
                "INSERT INTO submissions (participant_id, problem_id, language, code, passed_all, wrong_attempts, first_opened_at, last_updated) VALUES (?,?,?,?,0,0,?,?)",
                (participant_id, problem_id, language, user_code, now, now),
            )
        conn.commit()
    return jsonify({"ok": True})


@participant_bp.route("/api/end_test", methods=["POST"])
def end_test():
    if "participant_id" not in session:
        return jsonify({"error": "Not logged in"}), 401
    with get_db() as conn:
        conn.execute("UPDATE participants SET submitted=1, submit_time=? WHERE id=?",
                     (_now(), session["participant_id"]))
        conn.commit()
    session.clear()
    return jsonify({"success": True})


# ── HELPER ────────────────────────────────────────────────────────────────────
def _now():
    return datetime.now(timezone.utc).isoformat()