from flask import Blueprint, request, jsonify, render_template, session, redirect, url_for
import requests
from core.config import ADMIN_PASSWORD

admin_bp = Blueprint("admin", __name__)

# The URL where your Java Spring Boot microservice is running
JAVA_BACKEND_URL = "http://localhost:8080"


# ── PAGES (Handled purely by Python) ──────────────────────────────────────────

@admin_bp.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    if request.method == "POST":
        if request.json.get("password", "") == ADMIN_PASSWORD:
            session["admin"] = True
            return jsonify({"success": True})
        return jsonify({"error": "Wrong password"}), 403
    return render_template("admin_login.html")


# ── CONNECTED API (Python Auth -> Java Backend) ───────────────────────────────

@admin_bp.route("/api/admin/leaderboard")
def leaderboard():
    if not session.get("admin"):
        return jsonify({"error": "Unauthorized"}), 401
    
    # Forward the request to the Java backend
    try:
        response = requests.get(f"{JAVA_BACKEND_URL}/api/admin/leaderboard")
        return jsonify(response.json()), response.status_code
    except requests.ConnectionError:
        return jsonify({"error": "Backend service down"}), 503
