<!DOCTYPE html>
<html>
    <head>
        <title>Fantasy FRC</title>
        <style>
            /* Add a black background color to the top navigation */
            .topnav {
                background-color: #333;
                overflow: hidden;
            }
            
            /* Style the links inside the navigation bar */
            .topnav a {
                float: left;
                color: #f2f2f2;
                text-align: center;
                padding: 14px 16px;
                text-decoration: none;
                font-size: 17px;
            }
            
            /* Change the color of links on hover */
            .topnav a:hover {
                background-color: #ddd;
                color: black;
            }
            
            /* Add a color to the active/current link */
            .topnav a.active {
                background-color: #04AA6D;
                color: white;
            }
        </style>
        <script src="../server/user.js"></script>
        <script src="../server/login.js"></script>
    </head>
    <body>
        <div class="topnav">
            <a class="active" href="login.php">Logout</a>
            <a href="home.php">Home</a>
            <a href="rankings.php">Rankings</a>
            <a href="teams.php">Teams</a>
        </div>
        <h3 id="name">My Team</h3>
        <table id="teams" border=5>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Number</th>
                    <th>Stats(W/L/T)</th>
                    <th>Points</th>
                </tr>
            </thead>
            <tbody>

            </tbody>
        </table>
        <br><button id="login" onClick="loadUser()">Refresh</button>
        <h3>Stats</h3>
        <p id="totalPoints">
            Total Points:
        </p>
        <p id="rank">
            Current Rank:
        </p>
        <script>
            loadUser();
        </script>
    </body>
</html>