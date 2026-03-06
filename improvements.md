# Fantasy FRC Scoring System Improvements

The current scoring algorithm relies heavily on OPR and Win Percentage (`team_score = team_win_percent * team_average`). While simple and effective, this approach can sometimes overlook nuances in modern FRC gameplay. 

Here are some ways to improve the scoring system and make Fantasy FRC more competitive:

## 1. Implement EPA (Expected Points Added) from Statbotics
**Current Issue:** OPR (Offensive Power Rating) is outdated and prone to noise since it purely solves a system of linear equations ignoring defense and schedule difficulty.
**Improvement:** Migrate from TBA's OPR to Statbotics' EPA (Expected Points Added). EPA is statistically proven to be vastly superior to OPR in predicting team performance. Utilizing EPA would appropriately reward high-performing teams playing difficult schedules.
*Implementation:* Query the `https://api.statbotics.io/v2/team_event` or `/team_year` endpoints and replace `team_average`/`OPR` with `norm_epa` or `epa_end`.

## 2. Dynamic Component Weighting (Auto / Teleop / Endgame)
**Current Issue:** Win percentage gives equal weight to all match attributes.
**Improvement:** Break down the scoring into specific game phases (Autonomous, Teleop, Endgame/Climb). For example:
- `1.5x Multiplier` for consistent Endgame/Climb points (shows reliability).
- `1.2x Multiplier` for Autonomous scoring capabilities.
*Implementation:* TBA provides detailed score breakdowns in the match data arrays. We could sum the individual component scores and weight them differently.

## 3. Strength of Schedule (SOS) Adjustments
**Current Issue:** A team with a 90% Win Rate at a very easy regional gets more points than a team with a 70% Win Rate at a highly competitive District Championship.
**Improvement:** Apply a Strength of Schedule modifier.
*Implementation:* Calculate the average OPR or EPA of all teams at the given event. If the event's average is above the global average, multiply the team's score by an SOS factor (e.g., `1.10x`).

## 4. Playoff Performance vs. Qualification Performance
**Current Issue:** Qualifiers and Playoffs are currently meshed together in the total win percentage calculation.
**Improvement:** Playoff matches are significantly harder and more representative of a team's true skill. 
*Implementation:* 
- Qual Win = 2 Fantasy Points
- Playoff Win = 5 Fantasy Points
- Event Win (Blue Banner) = +25 Fantasy Points Bonus

## 5. Penalty Deductions
**Current Issue:** Penalties are ignored.
**Improvement:** Teams that consistently draw high penalties (foul points given to the opposing alliance) should be penalized in Fantasy FRC.
*Implementation:* Count the average foul points drawn by the team and subtract it from their weekly score. 

## 6. Real-Time Weekend Live Scoring
**Current Issue:** The script updating scores runs daily via CRON job.
**Improvement:** Instead of daily batch updates, we could implement a system (using Webhooks from TBA) that streams match data directly to the Next.js app, giving users a "Live Dashboard" on weekends.
