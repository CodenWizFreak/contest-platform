from flask import Flask
from core.config   import SECRET_KEY
from core.database import init_db
from core.problems import load_problems
from routes.participant import participant_bp
from routes.admin       import admin_bp

app = Flask(__name__)
app.secret_key = SECRET_KEY

app.register_blueprint(participant_bp)
app.register_blueprint(admin_bp)

if __name__ == "__main__":
    init_db()
    load_problems()
    app.run(host="0.0.0.0", port=5000, debug=True)