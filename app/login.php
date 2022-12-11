<!DOCTYPE html>
<html>
    <head>
        <title>Login</title>
        <script src="../server/login.js"></script>
    </head>
    <body>
        <h1>Login</h1>
        <p id="loginError" style="color:red;"></p>
        <form name="sign-in" method="post" action="contact.php">
            <label for="user">Username:</label>
            <input type="text" id="user" name="user"><br>
            <label for="passw">Password:</label>
            <input type="text" id="passw" name="passw">
            <input type="submit" name="Submit" id="Submit" value="Submit">
        </form><br>
        <button id="login" onClick="login()">Login</button>
    </body>
</html>