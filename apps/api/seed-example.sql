-- An example event with a made-up roster, so a fresh database has
-- something to show. Every name, course and score in here is invented.
--
-- Apply after the migrations:
--   npx wrangler d1 execute <your-db> --local --file=./seed-example.sql
--
-- Twelve players, six a side -- which divides cleanly into pairs, unlike
-- an odd number a side (docs/SPEC.md). Two teams named for their
-- captains, because the captain and the all-time record are both derived
-- from the team name (docs/DATA-MODEL.md, apps/web/src/lib/sides.ts).

-- ---------------------------------------------------------- players
INSERT INTO player (id, name, nickname, created_at) VALUES ('p-fox', 'Fox', 'Fox', 1789000000);
INSERT INTO player (id, name, nickname, created_at) VALUES ('p-ames', 'Ames', 'Ames', 1789000000);
INSERT INTO player (id, name, nickname, created_at) VALUES ('p-beck', 'Beck', 'Beck', 1789000000);
INSERT INTO player (id, name, nickname, created_at) VALUES ('p-cruz', 'Cruz', 'Cruz', 1789000000);
INSERT INTO player (id, name, nickname, created_at) VALUES ('p-dale', 'Dale', 'Dale', 1789000000);
INSERT INTO player (id, name, nickname, created_at) VALUES ('p-ellis', 'Ellis', 'Ellis', 1789000000);
INSERT INTO player (id, name, nickname, created_at) VALUES ('p-wolf', 'Wolf', 'Wolf', 1789000000);
INSERT INTO player (id, name, nickname, created_at) VALUES ('p-finn', 'Finn', 'Finn', 1789000000);
INSERT INTO player (id, name, nickname, created_at) VALUES ('p-gray', 'Gray', 'Gray', 1789000000);
INSERT INTO player (id, name, nickname, created_at) VALUES ('p-hale', 'Hale', 'Hale', 1789000000);
INSERT INTO player (id, name, nickname, created_at) VALUES ('p-ives', 'Ives', 'Ives', 1789000000);
INSERT INTO player (id, name, nickname, created_at) VALUES ('p-jett', 'Jett', 'Jett', 1789000000);

-- ----------------------------------------------------------- course
INSERT INTO course (id, name, location) VALUES ('c-lakeside', 'Lakeside G&CC', 'Anytown, ST');
INSERT INTO tee_set (id, course_id, color, rating, slope) VALUES ('t-lakeside-white', 'c-lakeside', 'White', 71.4, 129);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 1, 4, 7, 389);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 2, 5, 11, 512);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 3, 3, 17, 168);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 4, 4, 1, 430);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 5, 4, 5, 401);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 6, 3, 15, 155);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 7, 4, 9, 372);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 8, 5, 3, 530);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 9, 4, 13, 405);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 10, 4, 8, 396);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 11, 3, 18, 142);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 12, 5, 12, 505);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 13, 4, 2, 441);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 14, 4, 6, 388);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 15, 3, 16, 176);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 16, 4, 10, 360);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 17, 5, 4, 520);
INSERT INTO tee_hole (tee_set_id, number, par, stroke_index, yards) VALUES ('t-lakeside-white', 18, 4, 14, 398);

-- ------------------------------------------------------------ event
INSERT INTO event (id, name, year, start_date, end_date, logo_url, join_code)
  VALUES ('e-2027', 'The Cup 2027', 2027, '2027-05-14', '2027-05-16', NULL, 'birdie');
INSERT INTO team (id, event_id, name, color, logo_url) VALUES ('e-2027-t1', 'e-2027', 'Team Fox', 'RED', NULL);
INSERT INTO team (id, event_id, name, color, logo_url) VALUES ('e-2027-t2', 'e-2027', 'Team Wolf', 'BLUE', NULL);

INSERT INTO team_member (team_id, player_id, handicap_index) VALUES ('e-2027-t1', 'p-fox', 4);
INSERT INTO team_member (team_id, player_id, handicap_index) VALUES ('e-2027-t1', 'p-ames', 11);
INSERT INTO team_member (team_id, player_id, handicap_index) VALUES ('e-2027-t1', 'p-beck', 18);
INSERT INTO team_member (team_id, player_id, handicap_index) VALUES ('e-2027-t1', 'p-cruz', 7);
INSERT INTO team_member (team_id, player_id, handicap_index) VALUES ('e-2027-t1', 'p-dale', 22);
INSERT INTO team_member (team_id, player_id, handicap_index) VALUES ('e-2027-t1', 'p-ellis', 14);
INSERT INTO team_member (team_id, player_id, handicap_index) VALUES ('e-2027-t2', 'p-wolf', 6);
INSERT INTO team_member (team_id, player_id, handicap_index) VALUES ('e-2027-t2', 'p-finn', 2);
INSERT INTO team_member (team_id, player_id, handicap_index) VALUES ('e-2027-t2', 'p-gray', 16);
INSERT INTO team_member (team_id, player_id, handicap_index) VALUES ('e-2027-t2', 'p-hale', 9);
INSERT INTO team_member (team_id, player_id, handicap_index) VALUES ('e-2027-t2', 'p-ives', 25);
INSERT INTO team_member (team_id, player_id, handicap_index) VALUES ('e-2027-t2', 'p-jett', 13);

-- ----------------------------------------------------------- rounds
-- Format is per round, not per event: three days, three shapes of golf.
INSERT INTO round (id, event_id, tee_set_id, date, tee_time, scoring_format, team_format, points_per_match, segment_points)
  VALUES ('r-fri', 'e-2027', 't-lakeside-white', '2027-05-14', '13:00', 'NASSAU', 'FOURBALL', NULL, NULL);
INSERT INTO round (id, event_id, tee_set_id, date, tee_time, scoring_format, team_format, points_per_match, segment_points)
  VALUES ('r-sat', 'e-2027', 't-lakeside-white', '2027-05-15', '10:15', 'NASSAU', 'FOURSOMES', NULL, NULL);
INSERT INTO round (id, event_id, tee_set_id, date, tee_time, scoring_format, team_format, points_per_match, segment_points)
  VALUES ('r-sun', 'e-2027', 't-lakeside-white', '2027-05-16', '08:30', 'MATCH_PLAY', 'SINGLES', NULL, NULL);

-- ---------------------------------------------------------- matches
-- strokes_received is resolved at match creation (schema.ts) and is
-- RELATIVE to the lowest handicap in that match -- the low man plays off
-- scratch and everyone else gets the difference.
-- Friday match 1 -- fourball, best ball of each pair
INSERT INTO match (id, round_id, designated_scorer_id) VALUES ('m-fri-1', 'r-fri', 'p-fox');
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-fri-1', 'p-fox', 'RED', 2);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-fri-1', 'p-ames', 'RED', 9);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-fri-1', 'p-wolf', 'BLUE', 4);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-fri-1', 'p-finn', 'BLUE', 0);
-- Friday match 2 -- fourball, best ball of each pair
INSERT INTO match (id, round_id, designated_scorer_id) VALUES ('m-fri-2', 'r-fri', 'p-beck');
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-fri-2', 'p-beck', 'RED', 11);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-fri-2', 'p-cruz', 'RED', 0);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-fri-2', 'p-gray', 'BLUE', 9);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-fri-2', 'p-hale', 'BLUE', 2);
-- Friday match 3 -- fourball, best ball of each pair
INSERT INTO match (id, round_id, designated_scorer_id) VALUES ('m-fri-3', 'r-fri', 'p-dale');
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-fri-3', 'p-dale', 'RED', 9);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-fri-3', 'p-ellis', 'RED', 1);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-fri-3', 'p-ives', 'BLUE', 12);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-fri-3', 'p-jett', 'BLUE', 0);

-- Saturday match 1 -- foursomes, one ball a side
INSERT INTO match (id, round_id, designated_scorer_id) VALUES ('m-sat-1', 'r-sat', 'p-fox');
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sat-1', 'p-fox', 'RED', 0);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sat-1', 'p-cruz', 'RED', 3);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sat-1', 'p-wolf', 'BLUE', 2);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sat-1', 'p-hale', 'BLUE', 5);
-- Saturday match 2 -- foursomes, one ball a side
INSERT INTO match (id, round_id, designated_scorer_id) VALUES ('m-sat-2', 'r-sat', 'p-ames');
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sat-2', 'p-ames', 'RED', 9);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sat-2', 'p-dale', 'RED', 20);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sat-2', 'p-finn', 'BLUE', 0);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sat-2', 'p-ives', 'BLUE', 23);
-- Saturday match 3 -- foursomes, one ball a side
INSERT INTO match (id, round_id, designated_scorer_id) VALUES ('m-sat-3', 'r-sat', 'p-beck');
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sat-3', 'p-beck', 'RED', 5);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sat-3', 'p-ellis', 'RED', 1);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sat-3', 'p-gray', 'BLUE', 3);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sat-3', 'p-jett', 'BLUE', 0);

-- Sunday match 1 -- singles
INSERT INTO match (id, round_id, designated_scorer_id) VALUES ('m-sun-1', 'r-sun', 'p-fox');
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sun-1', 'p-fox', 'RED', 0);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sun-1', 'p-wolf', 'BLUE', 2);
-- Sunday match 2 -- singles
INSERT INTO match (id, round_id, designated_scorer_id) VALUES ('m-sun-2', 'r-sun', 'p-ames');
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sun-2', 'p-ames', 'RED', 9);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sun-2', 'p-finn', 'BLUE', 0);
-- Sunday match 3 -- singles
INSERT INTO match (id, round_id, designated_scorer_id) VALUES ('m-sun-3', 'r-sun', 'p-beck');
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sun-3', 'p-beck', 'RED', 2);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sun-3', 'p-gray', 'BLUE', 0);
-- Sunday match 4 -- singles
INSERT INTO match (id, round_id, designated_scorer_id) VALUES ('m-sun-4', 'r-sun', 'p-cruz');
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sun-4', 'p-cruz', 'RED', 0);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sun-4', 'p-hale', 'BLUE', 2);
-- Sunday match 5 -- singles
INSERT INTO match (id, round_id, designated_scorer_id) VALUES ('m-sun-5', 'r-sun', 'p-dale');
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sun-5', 'p-dale', 'RED', 0);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sun-5', 'p-ives', 'BLUE', 3);
-- Sunday match 6 -- singles
INSERT INTO match (id, round_id, designated_scorer_id) VALUES ('m-sun-6', 'r-sun', 'p-ellis');
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sun-6', 'p-ellis', 'RED', 1);
INSERT INTO match_player (match_id, player_id, side, strokes_received) VALUES ('m-sun-6', 'p-jett', 'BLUE', 0);

-- No hole_score rows: the event hasn't been played. Every standing, point
-- and record in the app is derived from those rows (docs/SCORING.md), so
-- a fresh database correctly reads 'Not started' everywhere.

-- ----------------------------------------------------------- awards
-- Two set by hand, three that work themselves out as the trip is played
-- (apps/api/src/lib/awards.ts). Rename them to whatever your group
-- already jokes about -- the rule is what decides them, not the name.
INSERT INTO award (id, event_id, name, enabled, rule, sort_order) VALUES
  ('aw-ctp', 'e-2027', 'Closest to Pin', 1, 'MANUAL', 1),
  ('aw-long', 'e-2027', 'Long Drive', 1, 'MANUAL', 2),
  ('aw-top-lead', 'e-2027', 'Top Dog', 1, 'LEAD_TEAM_MOST_POINTS', 3),
  ('aw-top-trail', 'e-2027', 'Best of the Rest', 1, 'TRAIL_TEAM_MOST_POINTS', 4),
  ('aw-spoon', 'e-2027', 'Wooden Spoon', 1, 'TRAIL_TEAM_FEWEST_POINTS', 5),
  ('aw-birdies', 'e-2027', 'Birdie Machine', 1, 'MOST_BIRDIES', 6);

-- ------------------------------------------------------ local rules
INSERT INTO quick_rule (id, title, body, sort_order) VALUES
  ('qr-max', 'Max Score', 'Double par, plus 2 strokes — pick it up.', 1),
  ('qr-breakfast', 'Breakfast Ball', 'One off the first tee each day.', 2),
  ('qr-ob', 'OB & Hazards', 'Drop at point of entry, one stroke.', 3),
  ('qr-gimme', 'Gimmes', 'Only the opposing side can give you one.', 4),
  ('qr-relief', 'Free Relief', 'One club length, no closer to the hole.', 5),
  ('qr-pace', 'Pace', 'Ready golf, always.', 6);

-- -------------------------------------------------- a previous year
-- A year from before this app existed: no hole-by-hole scores, just the
-- declared result of each match and what everyone shot. This is what the
-- historical_* tables are for (schema.ts), and it gives History and the
-- all-time record something to show.
--
-- The side labels (FOX, WOLF) are matched back to today's teams by name,
-- so 'Team Fox' picks up FOX's results. Rename a team and that year drops
-- out of the all-time tally rather than being credited to the wrong side.
INSERT INTO historical_year (year, name, winner) VALUES (2026, '1st Annual Cup', NULL);
INSERT INTO historical_round (year, round_number, course_name, points_per_match, format) VALUES (2026, 1, 'Lakeside G&CC', 3, 'Fourball');
INSERT INTO historical_round (year, round_number, course_name, points_per_match, format) VALUES (2026, 2, 'Riverbend Links', 3, 'Foursomes');
INSERT INTO historical_round (year, round_number, course_name, points_per_match, format) VALUES (2026, 3, 'Lakeside G&CC', 3, 'Singles');

INSERT INTO historical_match (year, round_number, match_number, front9_winner, back9_winner, overall_winner) VALUES (2026, 1, 1, 'FOX', 'WOLF', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 1, 1, 'p-fox', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 1, 1, 'p-ames', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 1, 1, 'p-wolf', 'WOLF');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 1, 1, 'p-finn', 'WOLF');
INSERT INTO historical_match (year, round_number, match_number, front9_winner, back9_winner, overall_winner) VALUES (2026, 1, 2, 'WOLF', 'WOLF', 'WOLF');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 1, 2, 'p-beck', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 1, 2, 'p-cruz', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 1, 2, 'p-gray', 'WOLF');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 1, 2, 'p-hale', 'WOLF');
INSERT INTO historical_match (year, round_number, match_number, front9_winner, back9_winner, overall_winner) VALUES (2026, 1, 3, 'FOX', 'TIE', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 1, 3, 'p-dale', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 1, 3, 'p-ellis', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 1, 3, 'p-ives', 'WOLF');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 1, 3, 'p-jett', 'WOLF');
INSERT INTO historical_match (year, round_number, match_number, front9_winner, back9_winner, overall_winner) VALUES (2026, 2, 1, 'TIE', 'FOX', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 2, 1, 'p-fox', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 2, 1, 'p-cruz', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 2, 1, 'p-wolf', 'WOLF');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 2, 1, 'p-hale', 'WOLF');
INSERT INTO historical_match (year, round_number, match_number, front9_winner, back9_winner, overall_winner) VALUES (2026, 2, 2, 'WOLF', 'WOLF', 'WOLF');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 2, 2, 'p-ames', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 2, 2, 'p-dale', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 2, 2, 'p-finn', 'WOLF');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 2, 2, 'p-ives', 'WOLF');
INSERT INTO historical_match (year, round_number, match_number, front9_winner, back9_winner, overall_winner) VALUES (2026, 2, 3, 'FOX', 'WOLF', 'TIE');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 2, 3, 'p-beck', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 2, 3, 'p-ellis', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 2, 3, 'p-gray', 'WOLF');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 2, 3, 'p-jett', 'WOLF');
INSERT INTO historical_match (year, round_number, match_number, front9_winner, back9_winner, overall_winner) VALUES (2026, 3, 1, 'FOX', 'FOX', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 3, 1, 'p-fox', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 3, 1, 'p-wolf', 'WOLF');
INSERT INTO historical_match (year, round_number, match_number, front9_winner, back9_winner, overall_winner) VALUES (2026, 3, 2, 'WOLF', 'FOX', 'TIE');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 3, 2, 'p-ames', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 3, 2, 'p-finn', 'WOLF');
INSERT INTO historical_match (year, round_number, match_number, front9_winner, back9_winner, overall_winner) VALUES (2026, 3, 3, 'FOX', 'WOLF', 'WOLF');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 3, 3, 'p-beck', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 3, 3, 'p-gray', 'WOLF');
INSERT INTO historical_match (year, round_number, match_number, front9_winner, back9_winner, overall_winner) VALUES (2026, 3, 4, 'TIE', 'FOX', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 3, 4, 'p-cruz', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 3, 4, 'p-hale', 'WOLF');
INSERT INTO historical_match (year, round_number, match_number, front9_winner, back9_winner, overall_winner) VALUES (2026, 3, 5, 'WOLF', 'WOLF', 'WOLF');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 3, 5, 'p-dale', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 3, 5, 'p-ives', 'WOLF');
INSERT INTO historical_match (year, round_number, match_number, front9_winner, back9_winner, overall_winner) VALUES (2026, 3, 6, 'FOX', 'TIE', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 3, 6, 'p-ellis', 'FOX');
INSERT INTO historical_match_player (year, round_number, match_number, player_id, side) VALUES (2026, 3, 6, 'p-jett', 'WOLF');

-- What everyone shot that year, gross with net beside it.
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 1, 'p-fox', 77, 73);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 2, 'p-fox', 74, 70);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 3, 'p-fox', 78, 74);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 1, 'p-ames', 78, 67);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 2, 'p-ames', 79, 68);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 3, 'p-ames', 86, 75);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 1, 'p-beck', 85, 67);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 2, 'p-beck', 89, 71);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 3, 'p-beck', 84, 66);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 1, 'p-cruz', 83, 76);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 2, 'p-cruz', 78, 71);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 3, 'p-cruz', 75, 68);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 1, 'p-dale', 89, 67);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 2, 'p-dale', 94, 72);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 3, 'p-dale', 94, 72);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 1, 'p-ellis', 82, 68);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 2, 'p-ellis', 84, 70);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 3, 'p-ellis', 82, 68);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 1, 'p-wolf', 82, 76);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 2, 'p-wolf', 80, 74);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 3, 'p-wolf', 74, 68);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 1, 'p-finn', 72, 70);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 2, 'p-finn', 74, 72);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 3, 'p-finn', 71, 69);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 1, 'p-gray', 89, 73);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 2, 'p-gray', 83, 67);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 3, 'p-gray', 86, 70);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 1, 'p-hale', 77, 68);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 2, 'p-hale', 85, 76);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 3, 'p-hale', 79, 70);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 1, 'p-ives', 94, 69);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 2, 'p-ives', 96, 71);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 3, 'p-ives', 92, 67);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 1, 'p-jett', 88, 75);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 2, 'p-jett', 81, 68);
INSERT INTO historical_score (year, round_number, player_id, gross, net) VALUES (2026, 3, 'p-jett', 84, 71);
