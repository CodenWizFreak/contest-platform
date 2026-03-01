from flask import Blueprint, request, jsonify, render_template, session, redirect, url_for
import requests
from core.config import ADMIN_PASSWORD

admin_bp = Blueprint("admin", __name__)

# The URL where your Golang microservice is running
GO_BACKEND_URL = "http://localhost:8080"


# ── PAGES (Handled purely by Python) ──────────────────────────────────────────

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


# ── CONNECTED API (Python Auth -> Go Backend) ─────────────────────────────────

@admin_bp.route("/api/admin/start_contest", methods=["POST"])
def start_contest():
    if not session.get("admin"):
        return jsonify({"error": "Unauthorized"}), 401
    
    # Forward the request to the Go backend
    try:
        response = requests.post(f"{GO_BACKEND_URL}/api/admin/start_contest")
        return jsonify(response.json()), response.status_code
    except requests.ConnectionError:
        return jsonify({"error": "Backend service down"}), 503


@admin_bp.route("/api/admin/leaderboard")
def leaderboard():
    if not session.get("admin"):
        return jsonify({"error": "Unauthorized"}), 401
    
    # Fetch the heavily-processed SQL data from the Go backend
    try:
        response = requests.get(f"{GO_BACKEND_URL}/api/admin/leaderboard")
        return jsonify(response.json()), response.status_code
    except requests.ConnectionError:
        return jsonify({"error": "Backend service down"}), 503
