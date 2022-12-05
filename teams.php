<!DOCTYPE html>
<html>
    <head>
        <title>Teams</title>
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
        <script src="loadTeams.js"></script>
    </head>
    <body>
        <div class="topnav">
            <a class="active" href="login.php">Logout</a>
            <a href="home.php">Home</a>
            <a href="rankings.php">Rankings</a>
            <a href="teams.php">Teams</a>
        </div>
        <?php
            $ini = parse_ini_file("scripts/server_info.ini");
            $mysqli = new mysqli($ini['SQL_IP'], $ini['SQL_User'], $ini['SQL_Passw'], $ini['SQL_Database']);

            if ($mysqli -> connect_errno) {
                echo "Failed to connect to MySQL: " . $mysqli -> connect_error;
                exit();
            }

            $sql = "SELECT * FROM teams ORDER BY number";
            $result = $mysqli -> query($sql);

            // name, number, ranking, alliance, awards
            $teams[] = $result -> fetch_array(MYSQLI_BOTH);
            while ($row = $result -> fetch_array()) {
                $teams[] = $row;
            }

            echo "<table border=5><tr><td>Name</td><td>Number</td><td>Ranking</td><td>Alliance</td><td>Awards</td></tr>";
            foreach ($teams as $team){
                echo "<tr><td>".$team["name"]."</td><td>".$team["number"]."</td><td>".$team["ranking"]."</td><td>".$team["alliance"]."</td><td>".$team["awards"]."</td></tr>";
            }
            echo "</table></div>";

            // Free result set
            $result -> free_result();

            $mysqli -> close();
        ?>
    </body>
</html>