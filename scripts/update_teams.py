from CustomizedCalender import CustomizedCalendar, WEEKDAY
from configparser import ConfigParser
import mysql.connector as mc
import numpy as np
import requests
from datetime import datetime


# config = ConfigParser()
# config.read("scripts/server_info.ini")
# db = mc.connect(host=config.get("SQL", "SQL_IP"), user=config.get("SQL", "SQL_User"), password=config.get("SQL", "SQL_Passw"), auth_plugin='mysql_native_password', database=config.get("SQL", "SQL_Database"))
# my_cursor = db.cursor()

#"INSERT INTO users (name, password, teams, score, position) VALUES ('aidan', 'pass', '2451,111', 23.5, 1)"
EVENTS = {"9":["2023isde1","2023bcvi", "2023isde2"],
          "10":[],
          "11":[],
          "12":[],
          "13":[],
          "14":[],
          "15":[],
          "16":[],
          "17":[]
          }
YEAR = "2022"

def get_team(number):
    site = "https://www.thebluealliance.com/api/v3/team/frc"
    api = {"X-TBA-Auth-Key": config.get("TBA", "BLUE_ALLIANCE")}
    request = requests.get(url=site+str(number), headers=api)
    return request.json()

def get_event(key, value):
    site = "https://www.thebluealliance.com/api/v3/event/"
    api = {"X-TBA-Auth-Key": config.get("TBA", "BLUE_ALLIANCE")}
    request = requests.get(url=site+str(key)+"/"+value, headers=api)
    return request.json()

def get_location(team):
    site = "https://www.thebluealliance.com/api/v3/team/"
    api = {"X-TBA-Auth-Key": config.get("TBA", "BLUE_ALLIANCE")}
    request = requests.get(url=site+str(team)+"/districts", headers=api)
    
    if len(request.json()) > 0: # District
        for district in request.json():
            if district["year"] == YEAR:
                return district["abbreviation"]
    
    location = ""
    team = get_team(team)
    if location == "": # State
        location = team["country"]
        
    if location == "United States": # Country
         location = team["state_prov"]

    return location

def add_team(name, number, record, opr, average, score, location):
    sql = "INSERT INTO teams (name, number, record, opr, average, score, location) VALUES (%s, %s, %s, %s, %s, %s, %s)"
    val = (name, number, record, opr, average, score, location)
    my_cursor.execute(sql, val)

    db.commit()
    
def update_team(number, record, opr, average, score):
    sql = "UPDATE teams SET record = %s, opr = %s, average = %s, score = %s WHERE number = %s"
    val = (record, opr, average, score, number)
    my_cursor.execute(sql, val)

    db.commit()
    
def team_exists(number):
    sql = "SELECT * FROM teams WHERE number = %s"
    val = (number)
    my_cursor.execute(sql, val)

    db.commit()
    
    return my_cursor.rowcount > 0

def update_event(event):
    rankings = get_event(event, "rankings")["rankings"] # qual # loss, win, ties
    alliances = get_event(event, "alliances") # elims
    awards = get_event(event, "awards")
    teams = get_event(event, "teams")
    oprs = get_event(event, "oprs")
    averages = get_event(event, "teams/statuses")

    for team in teams:
        number = team["team_number"]
        ranking = np.array([str(value) for value in next((item["record"] for item in rankings if item["team_key"] == "frc"+str(number)), "0, 0, 0").values()])
        alliance = np.array([str(value) for value in next((item["status"]["record"] for item in alliances if any(team == "frc"+str(number) for team in item["picks"])), {"losses":0, "ties":0, "wins":0}).values()])
        record = ranking+alliance
        opr = oprs["oprs"]["frc"+str(team)]
        qual_average = [int(value) for value in next((item["ranking"]["qual_average"] for item in averages if item["ranking"]["team_key"] == "frc"+str(number)), 0).values()]
        playoff_average = [int(value) for value in next((item["playoff"]["playoff_average"] for item in averages if item["ranking"]["team_key"] == "frc"+str(number)), 0).values()]
        average = (qual_average[0]+playoff_average[0])/2
        score = average*(record[1]/record[0] if record[0] > 0 else 1)
        
        if team_exists(number):
            update_team(number, record, opr, average, score)
        else:
            name = team["nickname"]
            add_team(name, number, ",".join(record), opr, average, score, get_location(number))

def update_events(week):
    for event in EVENTS[week]:
        update_event(event)

my_calendar = CustomizedCalendar(start_weekday=WEEKDAY.SUN) # TODO march 4th
print(my_calendar.calculate(datetime(2023, 4, 23))[1])
print(my_calendar.calculate(datetime(2023, 3, 1))[1])
print()
print(my_calendar.calculate(datetime(2023, 3, 3))[1])
print(my_calendar.calculate(datetime(2023, 3, 4))[1])
print()
print(my_calendar.calculate(datetime(2023, 3, 4))[1])
print(my_calendar.calculate(datetime(2023, 3, 5))[1])
print()
# update_events(str(my_calendar.calculate(datetime.now())[1]))