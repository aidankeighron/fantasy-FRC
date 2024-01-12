# name, number, epa, average, score, location

import statbotics
from configparser import ConfigParser
import requests
import json

YEAR = 2024

config = ConfigParser()
config.read("server_info.ini")

def get_teams(year, page):
    site = "https://www.thebluealliance.com/api/v3/teams/"
    api = {"X-TBA-Auth-Key": config.get("TBA", "BLUE_ALLIANCE")}
    request = requests.get(url=site+str(year)+"/"+str(page)+"/simple", headers=api)
    return request.json()

sb = statbotics.Statbotics()

team_data = []
# last_team_number = 0
page = 0
while True:
    teams = get_teams(YEAR, page)
    if not teams:
        break
    print(page)
    page += 1
    for team in teams:
        try:
            team_info = sb.get_team_year(team["team_number"], YEAR-1)
        except:
            team_info = {"epa_end": 0}
        team_data.append({"name": team["nickname"], "number": team["team_number"], "epa": team_info["epa_end"], "average": 0, "score": 0, "location": team["state_prov"] if team["country"] == "USA" else team["country"]})
    # last_team_number = int(teams[-1]["team_number"])

# while True:
#     teams = get_teams(YEAR, page-1)
#     if not teams:
#         break
#     page += 1
#     for team in teams:
#         if int(team["team_number"]) > last_team_number:
#             team_data.append({"name": team["nickname"], "number": team["team_number"], "epa": 0, "average": 0, "score": 0, "location": team["state_prov"] if team["country"] == "USA" else team["country"]})

json_data = json.dumps({"teams": team_data}, indent=4)

with open('team_info.json', 'w') as file:
    file.write(json_data)