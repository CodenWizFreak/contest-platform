package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	_ "github.com/mattn/go-sqlite3" // SQLite driver
)

var db *sql.DB 

func nowISO() string {
	return time.Now().UTC().Format(time.RFC3339)
}

// setConfig simulates your Python core.database.set_config
func setConfig(key string, value string) {
	db.Exec("UPDATE config SET value = ? WHERE key = ?", value, key)
}

// POST /api/admin/start_contest
func startContest(w http.ResponseWriter, r *http.Request) {
	now := nowISO()
	setConfig("start_time", now)
	setConfig("contest_active", "1")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":    true,
		"start_time": now,
	})
}

// GET /api/admin/leaderboard
func leaderboard(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`
		SELECT 
			p.name, p.college, p.system_number,
			(SELECT COUNT(*) FROM solved s WHERE s.participant_id = p.id) AS solved_count,
			(SELECT COALESCE(SUM(sub.time_taken_seconds), 0) FROM submissions sub WHERE sub.participant_id = p.id) AS total_time,
			(SELECT COALESCE(SUM(sub.wrong_attempts), 0) FROM submissions sub WHERE sub.participant_id = p.id) AS total_wrong
		FROM participants p
		ORDER BY solved_count DESC, total_time ASC
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var board []map[string]interface{}
	for rows.Next() {
		var name, college, sysNum string
		var solved, timeTaken, wrong int
		rows.Scan(&name, &college, &sysNum, &solved, &timeTaken, &wrong)
		
		board = append(board, map[string]interface{}{
			"name": name, "college": college, "system_number": sysNum,
			"solved_count": solved, "total_time": timeTaken, "total_wrong": wrong,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(board)
}

func main() {
	var err error
	db, err = sql.Open("sqlite3", "./contest.db")
	if err != nil {
		panic(err)
	}
	defer db.Close()

	// Registering the API endpoints
	http.HandleFunc("/api/admin/start_contest", startContest)
	http.HandleFunc("/api/admin/leaderboard", leaderboard)
	
	// Start server on port 8080
	http.ListenAndServe(":8080", nil)
}
