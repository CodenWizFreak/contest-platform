# Code Among Us — Contest Platform
## Full Setup Guide for Ubuntu 24.04

---

## OVERVIEW
- Flask backend (Python)
- Monaco Editor (VS Code editor in browser)
- Judge0 for code execution (self-hosted via Docker)
- SQLite database (zero-config)
- 30 participants connect via LAN — no installation needed on lab PCs

---

## STEP 1 — Install Dependencies (on YOUR laptop only)

```bash
# Python + pip
sudo apt update
sudo apt install python3 python3-pip -y

# Install Flask and requests
cd ~/contest_platform
pip3 install flask requests --break-system-packages
```

---

## STEP 2 — Set Up Judge0 (run code in browser)

Judge0 runs in Docker. Your laptop is the server.

```bash
# Install Docker if not already installed
sudo apt install docker.io docker-compose -y
sudo usermod -aG docker $USER
newgrp docker

# Download Judge0
cd ~
wget https://github.com/judge0/judge0/releases/download/v1.13.1/judge0-v1.13.1.zip
unzip judge0-v1.13.1.zip
cd judge0-v1.13.1

# Fix Docker credential error (if it appears)
# Edit ~/.docker/config.json and replace entire contents with: {}

# Start Judge0
docker-compose up -d db redis
sleep 15
docker-compose up -d

# Verify Judge0 is running (should return JSON)
curl http://localhost:2358/system_info
```

Judge0 takes ~2 minutes to fully start the first time.

---

## STEP 3 — Configure the Platform

Open `app.py` and change these lines near the top:

```python
ADMIN_PASSWORD = "your_secret_password_here"   # Change this!
CONTEST_DURATION_SECONDS = 3600                  # 1 hour (adjust if needed)
```

---

## STEP 4 — Find Your LAN IP

```bash
ip addr show | grep "inet " | grep -v 127
```

Your IP will look like `192.168.1.42` or `10.0.0.5`.
This is the address participants will open in their browser.

---

## STEP 5 — Start the Contest Server

```bash
cd ~/contest_platform
python3 app.py
```

The server starts on port 5000.

---

## STEP 6 — On Contest Day

### Admin flow:
1. Open `http://localhost:5000/admin` on YOUR laptop
2. Login with the admin password
3. When ready to start the contest → click **▶ Start Contest**
4. This starts the shared 1-hour timer for everyone simultaneously
5. During the contest, watch the participant list refresh every 15 seconds
6. After contest → click **View Code** to see each participant's submissions

### Participant flow:
1. Open `http://YOUR_LAPTOP_IP:5000` on any lab PC
2. Fill in name, college, system number, phone → Enter the Ship
3. Select a task from the left sidebar
4. Choose language (Python/C/C++/Java)
5. Fix the intentionally broken code
6. Click **▶ Run** to test visible test cases
7. Click **✓ Submit** to run all test cases (including hidden)
8. Green tick appears when all test cases pass
9. End Test button appears in the last 10 minutes
10. After 1 hour, test auto-ends

---

## THE 6 QUESTIONS — AMONG US THEME

| Task | Title | Sabotage (Wrong algo) | Fix |
|------|-------|----------------------|-----|
| 1 | The Comm Tower | O(N²) frequency count | Use hashmap → O(N) |
| 2 | The Reactor Meltdown | O(N) linear search | Use binary search → O(log N) |
| 3 | The Vent Network | DFS (wrong for shortest path) | Use BFS → O(N+M) |
| 4 | The O2 Sabotage | O(N³) brute force subarray | Kadane's algorithm → O(N) |
| 5 | The Meeting Room | Count-based bracket check | Stack-based matching → O(N) |
| 6 | Emergency Meeting | O(N²) two-sum | Hashmap two-sum → O(N) |

Each question has 3 visible + 3 hidden test cases.

---

## EDITING QUESTIONS

Edit `data/problems.json` to change problems, test cases, or boilerplate code.

Structure per problem:
- `title`, `subtitle`, `description` — displayed to participants
- `required_complexity` — shown as a hint chip
- `visible_test_cases` — shown to participants
- `hidden_test_cases` — run on submit, not shown
- `boilerplate` — the wrong code shown in editor per language
- `hidden_main` — injected invisibly for execution

---

## ANTI-CHEAT FEATURES

- **Tab switching detection** — warning overlay appears, violations logged
- **Window blur detection** — same warning
- **Fullscreen enforcement** — prompts on first click
- **Keyboard shortcut blocking** — Ctrl+T, Ctrl+W, Alt+Tab blocked
- **Right-click disabled**
- **Auto-save every 30 seconds** — code preserved even if browser closes
- **One submission per phone number** — can't re-register after ending

---

## JUDGE0 LANGUAGE IDs USED

| Language | ID | Version |
|----------|----|---------|
| Python   | 71 | Python 3.8 |
| C++      | 54 | GCC 9.2 (C++17) |
| C        | 50 | GCC 9.2 |
| Java     | 62 | OpenJDK 13 |

---

## TROUBLESHOOTING

**Judge0 not responding:**
```bash
cd ~/judge0-v1.13.1
docker-compose ps          # Check all containers are Up
docker-compose logs worker # Check for errors
```

**Port 5000 blocked on LAN:**
```bash
sudo ufw allow 5000
```

**Participants can't reach your IP:**
```bash
# Make sure you're on the same network/switch as lab PCs
# Try pinging your laptop from a lab PC:
ping YOUR_LAPTOP_IP
```

**Reset database (clear all participants):**
```bash
rm contest.db
python3 app.py   # Auto-recreates fresh DB
```

---

## FILE STRUCTURE

```
contest_platform/
├── app.py                    ← Flask server (main)
├── requirements.txt
├── contest.db                ← Auto-created SQLite database
├── data/
│   └── problems.json         ← All 6 questions + test cases
└── templates/
    ├── register.html          ← Participant registration
    ├── contest.html           ← Main contest page (Monaco editor)
    ├── ended.html             ← After submitting
    ├── admin_login.html       ← Admin login
    └── admin.html             ← Admin dashboard
```
