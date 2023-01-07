const sqlConnection = require('./sqlConnection.js');
const express = require('express');
const uuid = require('uuid').v4;
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const bodyParser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const ini = require('ini');
const fs = require('fs');
const http = require('http');
const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");
const { json } = require('body-parser');
const io = new Server(server);

const config = ini.parse(fs.readFileSync('server_info.ini', 'utf-8'))
const connection = sqlConnection.setupSQLConnection();
const port = 3000;

let teamsJson;
fs.readFile('team_info.json', 'utf8', (err, jsonString) => {
  if (err) {
    console.log("File read failed:", err)
    return 
  }
  teamsJson = jsonString;
})

app.use( express.static( __dirname + '/www' ));

passport.use(new LocalStrategy(
  { usernameField: 'username' },
  async (username, password, done) => {
    const validUser = await sqlConnection.SQLResponse.verifyUser(connection, username, password);
    if (validUser == null || validUser == "") {
      return done(null, false, { message: 'Invalid credentials'});
    }
    let user = Object.values(JSON.parse(JSON.stringify(validUser[0])));
    user = {
      'username': user[1],
      'password': user[2],
      'id': user[0]
    }
    return done(null, user);
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user = await sqlConnection.SQLResponse.getUserInfo(connection, id);
  done(null, user);
});

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(session({
  genid: (req) => {
    return uuid();
  },
  store: new FileStore(),
  secret: config.SERVER.SECRET,
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

app.get('/', (req, res) => {
  res.sendFile('www/login.html', { root: __dirname });
});

app.post('/', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if(info) {return res.send(info.message)}
    if (err) { return next(err); }
    if (!user) { return res.redirect('/'); }
    req.login(user, (err) => {
      if (err) { return next(err); }
      return res.redirect('/home')
    });
  })(req, res, next);
});

app.get('/logout', (req, res) => {
  req.logout(function(err) {
    if (err) { return; }
    res.redirect('/');
  });
});

app.get('/home', (req, res) => {
  if (req.isAuthenticated()) {
    res.sendFile('www/home.html', { root: __dirname });
  }
  else {
    res.redirect('/');
  }
});

app.get('/admin', (req, res) => {
  user = Object.values(JSON.parse(JSON.stringify(req.user[0])))[1];
  if (user === "Aidan") {
    res.sendFile('www/admin.html', { root: __dirname });
  }
  else {
    res.sendStatus(401);
  }
});

app.get('/rankings', (req, res) => {
  if (req.isAuthenticated()) {
    res.sendFile('www/rankings.html', { root: __dirname });
  }
  else {
    res.redirect('/');
  }
});

app.get('/teams', (req, res) => {
  if (req.isAuthenticated()) {
    res.sendFile('www/teams.html', { root: __dirname });
  }
  else {
    res.redirect('/');
  }
});

app.get('/drafting', (req, res) => {
  if (req.isAuthenticated()) {
    res.sendFile('www/drafting.html', { root: __dirname });
  }
  else {
    res.redirect('/');
  }
});

app.get('/allow-cors/teams', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.isAuthenticated()) {
    if (req.query.user == "" || req.query.user == null) {
      message = await sqlConnection.SQLResponse.getTeams(connection, req.query.user);
    }
    else {
      user = Object.values(JSON.parse(JSON.stringify(req.user[0])))[1];
      message = await sqlConnection.SQLResponse.getTeams(connection, user);
    }
    res.send(message);
  }
  else {
    res.sendStatus(401);
  }
});

app.get('/allow-cors/users', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.isAuthenticated()) {
    if (req.query.user == "" || req.query.user == null) {
      message = await sqlConnection.SQLResponse.getUsers(connection, req.query.user);
    }
    else {
      user = Object.values(JSON.parse(JSON.stringify(req.user[0])))[1];
      message = await sqlConnection.SQLResponse.getUsers(connection, user);
    }
    res.send(message);
  }
  else {
    res.sendStatus(401);
  }
});

app.get('/allow-cors/all-teams', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.isAuthenticated()) {
    res.send(teamsJson);
  }
  else {
    res.sendStatus(401);
  }
});

server.listen(port, () =>
  console.log(`Server listening on port ${port}`),
);

// DRAFTING //

var userIDList = new Array();
var teamList = new Array();
var pickedTeamsList = new Array();
var userList = {};
var draftStarted = false;
const roundLength = 5; // seconds
const maxTeams = 3;

io.on('connection', (socket) => {
  if (draftStarted) {
    socket.emit('draft_started');
  }

  socket.on("get_start", () => {
    socket.emit('set_start', userIDList[0], userIDList[1]);
  });

  socket.on('start_draft', async (user) => {
    if (user !== "Aidan") { return; }
    if (draftStarted) { return; }
    console.log("draft started");
    draftStarted = true;
    io.emit('draft_started');
    await initializeDraft();
    io.emit('set_start', userIDList[0], userIDList[1]);
    startTimer(true);
  });

  socket.on('team_picked', (number, name, user) => {
    if (!draftStarted) { return; }
    console.log("team picked");
    if (user === userIDList[0]) {
      if (isValidTeam(number, user)) {
        userIDList.unshift(userIDList.pop());
        userList[user].current_teams += number+",";
        if (userList[user].current_teams.split(",").length > maxTeams) {
          userIDList.pop();
        }
        if (userIDList.length <= 1) {
          nextUser = "-";
        }
        else {
          nextUser = userIDList[1];
        }
        socket.emit('team_added', number, name);
        io.emit('team_removed', number, userIDList[0], nextUser);
        teamList["team"+number].owner = user;
        pickedTeamsList["team"+number] = teamList["team"+number]
        delete teamList["team"+number];
        if (userIDList.length <= 0) {
          draftStarted = false;
          saveData();
        }
        else {
          startTimer(true);
          io.emit('get_next_team');
        }
      }
      else {
        startTimer(true);
        socket.emit('wrong_next_team');
      }
      console.log(userList);
      console.log(userIDList);
    } 
  });
});

function isValidTeam(number, user) {
  let userTeams = userList[user].current_teams.toString().split(",");
  let currentTeam;
  for (team in teamList) {
    team = teamList[team];
    if (number == team.number) {
      currentTeam = team;
    }
  }

  for (team in pickedTeamsList) {
    team = pickedTeamsList[team];
    for (userTeam in userTeams) {
      userTeam = userTeams[userTeam];
      if (userTeam == team.number && currentTeam.location == team.location) {
        console.log("invalid team");
        return false;
      }
    }
  }
  return true;
}

async function initializeDraft() {
  var users = await sqlConnection.SQLResponse.getUsers(connection, null);
  for (let i = 0; i < users.length; i++) {
    user = users[i]
    userList[user.name] = {
      "name": user.name,
      "current_teams": "",
    };
    userIDList.push(user.name);
    userIDList = userIDList
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
  }
  let teams = JSON.parse(teamsJson)["teams"];
  for (let i = 0; i < teams.length; i++) {
    team = teams[i];
    teamList["team"+team.number.toString()] = {
      "name": team.name,
      "number": team.number,
      "opr": team.opr,
      "location": team.location,
      "owner": ""
    };
  }
}

let timeout;
let seconds;
function startTimer(clicked) {
  if (clicked) {
      clearTimeout(timeout);
      seconds = roundLength;
  }
  seconds--;
  if (seconds >= 0) {
    timeout = setTimeout(startTimer, 1000);
  }
  else {
    if (!clicked && draftStarted) {
      console.log("team override");
      let user = userIDList[0];
      index = 0;
      number = 0;
      do {
        number = Object.values(teamList)[index].number;
        index++;
      } while (!isValidTeam(number, user));
      teamList["team"+number].owner = user;
      pickedTeamsList["team"+number] = teamList["team"+number]
      delete teamList["team"+number];
      
      userIDList.unshift(userIDList.pop());
      userList[user].current_teams += number+",";
      if (userList[user].current_teams.split(",").length > maxTeams) {
        userIDList.pop();
      }
      if (userIDList.length <= 1) {
        nextUser = "-";
      }
      else {
        nextUser = userIDList[1];
      }
      io.emit('team_removed', number, userIDList[0], nextUser);
      if (userIDList.length <= 0) {
        draftStarted = false;
        saveData();
      }
      else {
        startTimer(true);
        io.emit('get_next_team');
      }
      console.log(userList);
    }
  }
}

async function saveData() {
  console.log("Draft ended");
  //await sqlConnection.SQLResponse.draftEnded(connection, userList, pickedTeamsList);
  io.emit("draft_ended")
}