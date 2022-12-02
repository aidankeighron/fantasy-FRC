from configparser import ConfigParser
import mysql.connector as mc
import requests

config = ConfigParser()
config.read("server_info.ini")
db = mc.connect(host="192.168.1.101", user="aidan", password=config.get("SQL", "SQL_passw"), auth_plugin='mysql_native_password', database="fantasy")
my_cursor = db.cursor()

EVENT = "2022ilch"

def get_team_number(number):
    site = "https://www.thebluealliance.com/api/v3/team/frc"
    api = {"X-TBA-Auth-Key": config.get("TBA", "BLUE_ALLIANCE")}
    request = requests.get(url=site+str(number), headers=api)
    return request.json()

def get_event(key, value):
    site = "https://www.thebluealliance.com/api/v3/event/"
    api = {"X-TBA-Auth-Key": config.get("TBA", "BLUE_ALLIANCE")}
    request = requests.get(url=site+str(key)+"/"+value, headers=api)
    return request.json()

def add_team(name, number, ranking, alliance, awards):
    sql = "INSERT INTO teams (name, number, ranking, alliance, awards) VALUES (%s, %s, %s, %s, %s)"
    val = (name, number, ranking, alliance, awards)
    my_cursor.execute(sql, val)

    db.commit()
        
#print(get_event("2022ilch", "rankings")["rankings"]) #oprs, alliances, teams, awards, rankings
my_cursor.execute("TRUNCATE TABLE teams;")

rankings = get_event(EVENT, "rankings")["rankings"] # qual
alliances = get_event(EVENT, "alliances") # elims
awards = get_event(EVENT, "awards")
teams = get_event(EVENT, "teams")

for team in teams:
    name = team["nickname"]
    number = team["team_number"]
    ranking = ",".join([str(value) for value in next((item["record"] for item in rankings if item["team_key"] == "frc"+str(number)), "0, 0, 0").values()])
    alliance = ",".join([str(value) for value in next((item["status"]["record"] for item in alliances if any(team == "frc"+str(number) for team in item["picks"])), {"losses":0, "ties":0, "wins":0}).values()])
    award = ",".join([item["name"] for item in awards if any(team["team_key"] == "frc"+str(number) for team in item["recipient_list"])])
    # print(name)
    # print(number)
    # print(ranking)
    # print(alliance)
    # print(award)
    add_team(name, number, ranking, alliance, award)
    