from flask import Blueprint, request, jsonify, render_template, session, redirect, url_for
from datetime import datetime, timezone
from core.database import get_db, get_config, set_config
from core.config import ADMIN_PASSWORD

admin_bp = Blueprint("admin", __name__)


def _now():
    return datetime.now(timezone.utc).isoformat()


# ── PAGES ─────────────────────────────────────────────────────────────────────

@admin_bp.route("/admin")
def admin():
    if not session.get("admin"):
        return redirect(url_for("admin.admin_login"))
    return render_template("admin.html")


@admin_bp.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    if request.method == "POST":
        if request.json.get("password", "") == ADMIN_PASSWORD:
            session["admin"] = True
            return jsonify({"success": True})
        return jsonify({"error": "Wrong password"}), 403
    return render_template("admin_login.html")


@admin_bp.route("/admin/logout")
def admin_logout():
    session.pop("admin", None)
    return redirect(url_for("admin.admin_login"))


# ── CONTEST CONTROLS ──────────────────────────────────────────────────────────

@admin_bp.route("/api/admin/start_contest", methods=["POST"])
def start_contest():
    if not session.get("admin"):
        return jsonify({"error": "Unauthorized"}), 401
    now = _now()
    set_config("start_time", now)
    set_config("contest_active", "1")
    return jsonify({"success": True, "start_time": now})


@admin_bp.route("/api/admin/stop_contest", methods=["POST"])
def stop_contest():
    if not session.get("admin"):
        return jsonify({"error": "Unauthorized"}), 401
    set_config("contest_active", "0")
    return jsonify({"success": True})


@admin_bp.route("/api/admin/end_participant", methods=["POST"])
def end_participant():
    if not session.get("admin"):
        return jsonify({"error": "Unauthorized"}), 401
    participant_id = int(request.json.get("participant_id", 0))
    with get_db() as conn:
        conn.execute(
            "UPDATE participants SET submitted=1, submit_time=? WHERE id=?",
            (_now(), participant_id),
        )
        conn.commit()
    return jsonify({"success": True})


# ── DATA ENDPOINTS ────────────────────────────────────────────────────────────

@admin_bp.route("/api/admin/participants")
def admin_participants():
    if not session.get("admin"):
        return jsonify({"error": "Unauthorized"}), 401
    with get_db() as conn:
        rows = conn.execute("""
            SELECT p.*,
            (SELECT COUNT(*) FROM solved s WHERE s.participant_id = p.id) as solved_count
            FROM participants p ORDER BY p.id
        """).fetchall()
    return jsonify([dict(r) for r in rows])


@admin_bp.route("/api/admin/participant_detail/<int:participant_id>")
def admin_participant_detail(participant_id):
    if not session.get("admin"):
        return jsonify({"error": "Unauthorized"}), 401
    with get_db() as conn:
        rows = conn.execute("""
            SELECT s.*,
            CASE WHEN sol.problem_id IS NOT NULL THEN 1 ELSE 0 END as is_solved
            FROM submissions s
            LEFT JOIN solved sol
              ON sol.participant_id = s.participant_id
             AND sol.problem_id     = s.problem_id
            WHERE s.participant_id = ?
            ORDER BY s.problem_id
        """, (participant_id,)).fetchall()
    return jsonify([dict(r) for r in rows])


@admin_bp.route("/api/admin/leaderboard")
def leaderboard():
    if not session.get("admin"):
        return jsonify({"error": "Unauthorized"}), 401
    with get_db() as conn:
        rows = conn.execute("""
            SELECT
                p.name, p.college, p.system_number,
                (SELECT COUNT(*)
                   FROM solved s
                  WHERE s.participant_id = p.id)               AS solved_count,
                (SELECT COALESCE(SUM(sub.time_taken_seconds), 0)
                   FROM submissions sub
                  WHERE sub.participant_id = p.id)             AS total_time,
                (SELECT COALESCE(SUM(sub.wrong_attempts), 0)
                   FROM submissions sub
                  WHERE sub.participant_id = p.id)             AS total_wrong
            FROM participants p
            ORDER BY solved_count DESC, total_time ASC
        """).fetchall()
    return jsonify([dict(r) for r in rows])