from CustomizedCalender import CustomizedCalendar, WEEKDAY
from configparser import ConfigParser
import mysql.connector as mc
import numpy as np
import requests
from datetime import datetime


config = ConfigParser()
config.read("server_info.ini")
db = mc.connect(host=config.get("SQL", "SQL_IP").replace('"', ""), user=config.get("SQL", "SQL_User").replace('"', ""), password=config.get("SQL", "SQL_Passw").replace('"', ""), auth_plugin='mysql_native_password', database=config.get("SQL", "SQL_Database").replace('"', ""))
my_cursor = db.cursor(buffered=True)

EVENTS = {"9":["2023isde1", "2023bcvi", "2023isde2"],
          "10":["2023flwp", "2023arli", "2023mndu", "2023mndu2", "2023mxmo", "2023utwv", "2023gaalb", "2023miesc", "2023mifor", "2023mijac", "2023miket", "2023mimil", "2023nhgrs", "2023txwac", "2023orore", "2023caph", "2023tuis3", "2023inmis", "2023mabri", "2023ncash", "2023onbar", "2023onnew", "2023pahat", "2023vabla", "2023txdal", "2023wasno"],
          "11":[],
          "12":[],
          "13":[],
          "14":[],
          "15":[],
          "16":[],
          "17":[]
          }

YEAR = "2023"

# UPDATE EVENTS #

def get_event(key, value):
    site = "https://www.thebluealliance.com/api/v3/event/"
    api = {"X-TBA-Auth-Key": config.get("TBA", "BLUE_ALLIANCE")}
    request = requests.get(url=site+str(key)+"/"+value, headers=api)
    return request.json()
    
def update_team(opr, average, score, number):
    sql = "UPDATE teams SET opr = %s, average = %s, score = %s WHERE number = %s"
    val = (opr, average, score, number)
    my_cursor.execute(sql, val)

    db.commit()

def update_event(event):
    rankings = get_event(event, "rankings")["rankings"] # qual # loss, win, ties
    alliances = get_event(event, "alliances") # elims
    teams = get_event(event, "teams")
    user_teams = get_teams()
    oprs = get_event(event, "oprs")
    team_statuses = get_event(event, "teams/statuses")

    for team in teams:
        # Check if it is a picked team
        number = team["team_number"]
        team_exists = False
        for user_team in user_teams:
            if user_team[1] == number:
                team_exists = True
        if not team_exists:
            continue
        
        # opr
        opr = oprs["oprs"]["frc"+str(number)]

        # average
        try:
            qual_average = team_statuses["frc"+str(number)]["qual"]["playoff_average"]["qual_average"] or 0
        except Exception as e:
            qual_average = 0
        try:
            playoff_average = team_statuses["frc"+str(number)]["playoff"]["playoff_average"] or 0
        except Exception as e:
            playoff_average = 0
            
        average = (qual_average+playoff_average)/2
        
        # score
        try:
            quals = np.array(list(team_statuses["frc"+str(number)]["qual"]["ranking"]["record"].values()))
        except Exception as e:
            quals = np.array([0, 0, 0])
        try:
            elims = np.array(list(team_statuses["frc"+str(number)]["playoff"]["record"].values()))
        except Exception as e:
            elims = np.array([0, 0, 0])

        record = quals+elims
        score = (record[2]/record[0] if record[0] > 0 else record[2])*(average+opr)
        
        print(str(opr) + " | " + str(average) + " | " + str(score) + " | " + str(record) + " | " + str(number))
        update_team(opr, average, score, number)

def update_events(week):
    #update_event("2022ilch")
    for event in EVENTS[week]:
        update_event(event)
    update_users()

# END UPDATE EVENTS #

# UPDATE USERS #

def update_user(score, position, name):
    sql = "UPDATE users SET score = %s position = %s WHERE name = %s"
    val = (score, position, name)
    my_cursor.execute(sql, val)

    db.commit()

def get_users():
    sql = "SELECT name, teams, score FROM users"
    my_cursor.execute(sql)

    db.commit()
    
    return my_cursor.fetchall()

def get_teams():
    sql = "SELECT * FROM teams"
    my_cursor.execute(sql)

    db.commit()
    
    return my_cursor.fetchall()

def update_users():
    users = get_users()
    users = [list(user) for user in users]
    teams = get_teams()

    for i, user in enumerate(users):
        score = 0
        user_teams = user[1].split(",")
        for user_team in user_teams:
            for team in teams:
                if str(user_team) == str(team[1]):
                    score += team[4] + 10
                    break
        user[2] = score
    users = sorted(users,key=lambda x: x[2])[::-1]
    for i, user in enumerate(users):
        #print(str(user[2]) + " | " + str(i+1) + " | " + str(user[0]))
        update_user(user[2], i+1, user[0])
        
# END UPDATE USERS #

my_calendar = CustomizedCalendar(start_weekday=WEEKDAY.SUN) # TODO week 2
print(my_calendar.calculate(datetime(2023, 2, 28))[1])
print(my_calendar.calculate(datetime(2023, 3, 1))[1])
print()
print(my_calendar.calculate(datetime(2023, 3, 3))[1])
print(my_calendar.calculate(datetime(2023, 3, 4))[1])
print()
print(my_calendar.calculate(datetime(2023, 3, 5))[1])
print(my_calendar.calculate(datetime(2023, 3, 6))[1])

# update_events(str(my_calendar.calculate(datetime.now())[1]-1))