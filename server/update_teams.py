from CustomizedCalender import CustomizedCalendar, WEEKDAY
from configparser import ConfigParser
import mysql.connector as mc
import numpy as np
import requests
from datetime import datetime


config = ConfigParser()
config.read("server_info.ini")
# db = mc.connect(host=config.get("SQL", "SQL_IP").replace('"', ""), user=config.get("SQL", "SQL_User").replace('"', ""), password=config.get("SQL", "SQL_Passw").replace('"', ""), auth_plugin='mysql_native_password', database=config.get("SQL", "SQL_Database").replace('"', ""))
# my_cursor = db.cursor(buffered=True)

EVENTS = {15: ['2023alhu', '2023casj', '2023chcmp', '2023gacmp', '2023incmp', '2023micmp', '2023mrcmp', '2023necmp', '2023nyny', '2023oktu', '2023oncmp', '2023paca', '2023pncmp', '2023txcmp'], 10: ['2023arli', '2023caph', '2023flwp', '2023gaalb', '2023inmis', '2023mabri', '2023miesc', '2023mifor', '2023mijac', '2023miket', '2023mimil', '2023mndu', '2023mndu2', '2023mxmo', '2023ncash', '2023nhgrs', '2023onbar', '2023onnew', '2023orore', '2023pahat', '2023tuis3', '2023txdal', '2023txwac', '2023utwv', '2023vabla', '2023wasno'], 11: ['2023ausc', '2023cafr', '2023caoc', '2023cave', '2023ctwat', '2023gadal', '2023ilch', '2023inpri', '2023isde3', '2023isde4', '2023mdbet', '2023midtr', '2023mike2', '2023milan', 
'2023misjo', '2023mosl', '2023ncjoh', '2023ndgf', '2023njfla', '2023okok', '2023orwil', '2023rinsc', '2023scand', '2023tume', '2023txbel', '2023txcha'], 13: ['2023azgl', '2023cada', '2023casd', '2023code', '2023flta', '2023gacar', '2023hiho', '2023iacf', '2023inwla', '2023mabos', '2023mdtim', '2023mila2', '2023milak', '2023milsu', '2023mimid', '2023mitry', '2023miwmi', '2023mnmi2', '2023mose', '2023mxto', '2023ncpem', '2023nhdur', '2023njtab', '2023njwas', '2023nyli2', '2023onnob', '2023onwat', '2023orsal', '2023schar', '2023tuis', '2023tuis2', '2023txhou', '2023vagle', '2023wasam', '2023wimi', '2023zhha'], 12: ['2023azva', '2023brbr', '2023cala', '2023casf', '2023flor', '2023gagwi', '2023ilpe', '2023iscmp', '2023ksla', '2023marea', '2023mawne', '2023mibel', '2023midet', '2023mimus', '2023mista', '2023mitvc', '2023mslr', '2023mxpu', '2023ncmec', '2023ncwak', '2023njrob', '2023nyli', '2023nyro', '2023ohmv', '2023onlon', '2023ontor', '2023paphi', '2023txfor', '2023txsan', '2023vaale', '2023vapor', '2023wabon', '2023wayak'], 9: ['2023bcvi', '2023cops', '2023isde1', '2023isde2'], 14: ['2023caav', '2023camb', '2023cthar', '2023gamac', '2023idbo', '2023ingre', '2023lake', '2023mawor', '2023miken', '2023miliv', '2023mimcc', '2023misal', '2023mitr2', '2023mnmi', '2023mokc', '2023nccmp', '2023njski', '2023nvlv', '2023nytr', '2023ohcl', '2023onham', '2023onwin', '2023paben', '2023qcmo', '2023tnkn', '2023txama', '2023txcle', '2023waahs', '2023wila'], 17: ['2023cmptx']}

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
                current_team = user_team
                team_exists = True
                break
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
        score = (score + team_exists[4])/2
        
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
                    score += team[4]
                    break
        user[2] = score
    users = sorted(users,key=lambda x: x[2])[::-1]
    for i, user in enumerate(users):
        #print(str(user[2]) + " | " + str(i+1) + " | " + str(user[0]))
        update_user(user[2], i+1, user[0])

# END UPDATE USERS #

def get_event_keys(year):
    site = "https://www.thebluealliance.com/api/v3/events/"
    api = {"X-TBA-Auth-Key": config.get("TBA", "BLUE_ALLIANCE")}
    request = requests.get(url=site+str(year)+"/simple", headers=api)
    return request.json()

def setupEvents():
    events = {}
    for event in get_event_keys(YEAR):
        date = event["end_date"].split("-")
        try:
            comp_week = my_calendar.calculate(datetime(int(YEAR), int(date[1]), int(date[2])+1))[1]
        except Exception as e:
            comp_week = my_calendar.calculate(datetime(int(YEAR), int(date[1])+1, 1))[1]
        try:
            events[comp_week].append(event["key"])
        except Exception as e:
            events[comp_week] = [event["key"]]
    print(events)
            

my_calendar = CustomizedCalendar(start_weekday=WEEKDAY.SUN)
# print(my_calendar.calculate(datetime(2023, 4, 22))[1])
# print(my_calendar.calculate(datetime(2023, 4, 23))[1])
# print()
# print(my_calendar.calculate(datetime(2023, 4, 1))[1])
# print(my_calendar.calculate(datetime(2023, 4, 2))[1])
# print()
# print(my_calendar.calculate(datetime(2023, 4, 2))[1])
# print(my_calendar.calculate(datetime(2023, 4, 3))[1])

# update_events(str(my_calendar.calculate(datetime.now())[1]-1))