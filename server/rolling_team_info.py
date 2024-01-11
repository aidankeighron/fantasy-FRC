from configparser import ConfigParser
import mysql.connector as mc
import numpy as np
import requests

config = ConfigParser()
config.read("server_info.ini")
db = mc.connect(host=config.get("SQL", "SQL_IP").replace('"', ""), user=config.get("SQL", "SQL_User").replace('"', ""), password=config.get("SQL", "SQL_Passw").replace('"', ""), auth_plugin='mysql_native_password', database=config.get("SQL", "SQL_Database").replace('"', ""))
my_cursor = db.cursor(buffered=True)

## DATABASE ## 

def get_usernames():
    sql = "SELECT name FROM users"
    my_cursor.execute(sql)

    db.commit()
    
    return my_cursor.fetchall()

def get_user_teams(user):
    sql = "SELECT * FROM teams WHERE owner = '"+user+"'"
    # val = (user)
    my_cursor.execute(sql)

    db.commit()
    
    return my_cursor.fetchall()
    
def set_user_score(score, position, quals_score, elim_score, name):
    print("user updating")
    sql = "UPDATE users SET score = %s, position = %s, quals_score = %s, elim_score = %s WHERE name = %s"
    val = (score, position, quals_score, elim_score, name)
    my_cursor.execute(sql, val)

    db.commit()

def update_team(opr, average, score, winPercent, number):
    print("team updating")
    sql = "UPDATE teams SET opr = %s, average = %s, score = %s, winPercent = %s WHERE number = %s"
    val = (opr, average, score, winPercent, number)
    my_cursor.execute(sql, val)

    db.commit()
    
## DATABASE ## 

YEAR = "2024"

cached_teams_statuses = {}
cached_team_oprs = {}

def get_event(key, value):
    site = "https://www.thebluealliance.com/api/v3/event/"
    api = {"X-TBA-Auth-Key": config.get("TBA", "BLUE_ALLIANCE")}
    request = requests.get(url=site+str(key)+"/"+value, headers=api)
    return request.json()

def get_team_events(team):
    site = "https://www.thebluealliance.com/api/v3/team/"
    api = {"X-TBA-Auth-Key": config.get("TBA", "BLUE_ALLIANCE")}
    request = requests.get(url=site+str(team)+"/events/"+YEAR+"/keys", headers=api)
    return request.json()

def get_team_event_quals(team, event):
    try:
        # Teams Statuses
        if event in cached_teams_statuses:
            teams_statuses = cached_teams_statuses[event]
        else:
            teams_statuses = get_event(event, "teams/statuses")
            cached_teams_statuses.update({event: teams_statuses})

        average = teams_statuses[team]["qual"]["ranking"]["sort_orders"][1]
        wins = teams_statuses[team]["qual"]["ranking"]["record"]["wins"]
        matches_played = teams_statuses[team]["qual"]["ranking"]["matches_played"]
        
        # Opr
        if event in cached_team_oprs:
            teams_oprs = cached_team_oprs[event]
        else:
            teams_oprs = get_event(event, "oprs")
            cached_team_oprs.update({event: teams_oprs})
            
        opr = teams_oprs["oprs"][team]
    except:
        return (0, 0, 0, 0, False)
    
    return (opr, average, wins, matches_played, True)

def get_team_event_elims(team, event):
    try:
        # Teams Statuses
        if event in cached_teams_statuses:
            teams_statuses = cached_teams_statuses[event]
        else:
            teams_statuses = get_event(event, "teams/statuses")
            cached_teams_statuses.update({event: teams_statuses})

        wins = teams_statuses[team]["playoff"]["record"]["wins"]
        matches_played = teams_statuses[team]["playoff"]["record"]["wins"] + teams_statuses[team]["playoff"]["record"]["losses"] + teams_statuses[team]["playoff"]["record"]["ties"]
    except:
        return (0, 0, False)
    
    return (wins, matches_played, True)

def get_team_data(team):
    events = get_team_events(team)
    played_quals = 0
    played_elims = 0
    team_opr = 0
    team_average = 0
    team_elim_wins = 0
    team_elim_matches_played = 0
    team_qual_wins = 0
    team_qual_matches_played = 0
    # Get events
    for event in events:
        if event == "2024week0":
            continue
        (qual_opr, qual_average, qual_wins, qual_matches_played, qual_event_played) = get_team_event_quals(team, event)
        if not qual_event_played:
            continue
        team_opr += qual_opr
        team_average += qual_average
        team_qual_wins += qual_wins
        team_qual_matches_played += qual_matches_played
        played_quals += 1
        (elim_wins, elim_matches_played, elim_event_played) = get_team_event_elims(team, event)
        if not elim_event_played:
            continue
        team_elim_wins += elim_wins
        team_elim_matches_played += elim_matches_played
        played_elims += 1
    if played_quals == 0:
        return (0, 0, 0, 0, 0, 0)
    
    
    # Qual
    team_opr /= played_quals
    team_average /= played_quals
    qual_team_win_percent = (team_qual_wins/team_qual_matches_played)# / played_quals
    team_qual_score = qual_team_win_percent * team_average
    # Elim
    if played_elims == 0:
        team_elim_score = 0
        team_score = team_qual_score
        team_win_percent = qual_team_win_percent
    else:
        elim_team_win_percent = (team_elim_wins/team_elim_matches_played) / played_elims
        team_elim_score = elim_team_win_percent * team_average
        team_win_percent = (team_qual_wins+team_elim_wins)/(team_qual_matches_played+team_elim_matches_played)# / (played_quals+played_elims)
        team_score = team_win_percent * team_average
    # print("***********")
    # print(team)
    # print(team_opr)
    # print(team_average)
    # print(team_score)
    # print(team_win_percent)
    # print(team_qual_score)
    # print(team_elim_score)
    return (team_opr, team_average, team_score, team_win_percent, team_qual_score, team_elim_score)
    
def update_user_score(user):
    teams = get_user_teams(user)
    user_score = 0
    quals_score = 0
    elim_score = 0
    active_teams = 0

    for team in teams:
        (team_opr, team_average, team_score, team_winPercent, team_qual_score, team_elim_score) = get_team_data("frc"+str(team[1]))
        update_team(team_opr, team_average, team_score, team_winPercent, team[1])

        if team_score != 0:
            user_score += team_score
            quals_score += team_qual_score
            elim_score += team_elim_score
            active_teams += 1
    if active_teams == 0:
        return (0)
    # user_score /= active_teams
    
    return (user_score, quals_score, elim_score)

def update_all_users():
    users = get_usernames()
    user_dict = {}
    
    for user in users:
        user_dict.update({user[0]: update_user_score(user[0])})
    user_dict = sorted(user_dict.items(), key=lambda x:x[1], reverse=True)
    rank = 1
    for user in user_dict:
        set_user_score(user[1][0], rank, user[1][1], user[1][2], user[0])
        rank += 1

update_all_users()