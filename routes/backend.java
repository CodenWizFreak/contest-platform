package com.contest.backend;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // POST /api/admin/start_contest
    @PostMapping("/start_contest")
    public Map<String, Object> startContest() {
        String now = Instant.now().toString();
        
        jdbcTemplate.update("UPDATE config SET value = ? WHERE key = ?", now, "start_time");
        jdbcTemplate.update("UPDATE config SET value = ? WHERE key = ?", "1", "contest_active");
        
        return Map.of("success", true, "start_time", now);
    }

    // GET /api/admin/leaderboard
    @GetMapping("/leaderboard")
    public List<Map<String, Object>> getLeaderboard() {
        String sql = """
            SELECT 
                p.name, p.college, p.system_number,
                (SELECT COUNT(*) FROM solved s WHERE s.participant_id = p.id) AS solved_count,
                (SELECT COALESCE(SUM(sub.time_taken_seconds), 0) FROM submissions sub WHERE sub.participant_id = p.id) AS total_time,
                (SELECT COALESCE(SUM(sub.wrong_attempts), 0) FROM submissions sub WHERE sub.participant_id = p.id) AS total_wrong
            FROM participants p
            ORDER BY solved_count DESC, total_time ASC
        """;
        
        // Spring Boot automatically maps the SQL result into a list of JSON objects
        return jdbcTemplate.queryForList(sql);
    }
}
