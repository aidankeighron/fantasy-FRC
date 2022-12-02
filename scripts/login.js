function login() {
    var user = document.getElementById("user").value;
    var passw = document.getElementById("passw").value;

    if (user == "")
        document.getElementById("loginError").innerHTML = "Please enter Username";
    else if (passw == "")
        document.getElementById("loginError").innerHTML = "Please enter Password";
    else
        if (checkLogin(user, passw))
            document.getElementById("loginError").innerHTML = "";
        else
            document.getElementById("loginError").innerHTML = "Incorrect Username and Password";

}

function checkLogin(user, passw) {
    sessionStorage.setItem("username", user);

    window.location = "home.html";
    return true;
}

