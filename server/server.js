// HTTPS
var fs = require('fs');

const sqlConnection = require('./sqlConnection.js');
const express = require('express');
const uuid = require('uuid').v4;
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const bodyParser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const ini = require('ini');
const http = require('http');
const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");
const { json } = require('body-parser');
const io = new Server(server);
const cookie = require('cookie');
const signature = require('cookie-signature');

const config = ini.parse(fs.readFileSync('server_info.ini', 'utf-8'))
const connection = sqlConnection.setupSQLConnection();
const httpPort = 80;
const httpsPort = 443;
const SQLRegex = new RegExp("[\\;\\/\"\']", 'g');


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
    if (SQLRegex.test(username) || SQLRegex.test(password)) {
      return done(null, false, { message: 'Invalid credentials'});
    }
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

var name = 'connect.sid';
var secret = config.SERVER.SECRET;
var store = new FileStore();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(session({
  genid: (req) => {
    return uuid();
  },
  name: name,
  store: store,
  secret: secret,
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

app.get('/', (req, res) => {
  res.sendFile('www/login.html', { root: __dirname });
});

app.use((req, res, next) => {
  if (req.protocol == 'https') {
    return res.redirect(301, `http://${req.headers.host}${req.url}`);
  }
  next();
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
  req.session.destroy(function (err) {
    res.clearCookie('connect.sid')
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
  if (req.isAuthenticated()) {
    user = Object.values(JSON.parse(JSON.stringify(req.user[0])))[1];
    if (user === "Aidan") {
      res.sendFile('www/admin.html', { root: __dirname });
    }
    else {
      res.sendStatus(403);
    }
  }
  else {
    res.redirect('/');
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

app.get('/allow-cors/all-teams', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.isAuthenticated()) {
    // if (Object.keys(teamList).length != 0) {
    //   res.send(JSON.stringify({"teams":teamList}));
    // }
    // else {
      res.send(teamsJson);
    // }
  }
  else {
    res.sendStatus(401);
  }
});

app.get('/allow-cors/add-user', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  user = Object.values(JSON.parse(JSON.stringify(req.user[0])))[1];
  if (req.isAuthenticated() && user === "Aidan") {
    message = await sqlConnection.SQLResponse.addUser(connection, req.query.user, req.query.passw);
    res.send(message);
  }
  else {
    res.sendStatus(403);
  }
})

server.listen(httpPort, () =>
  console.log(`Server listening on port ${httpPort}`),
);

// DRAFTING //

var userIDList = new Array();
var teamList = new Array();
var pickedTeamsList = new Array();
var userList = {};
var draftStarted = false;
const roundLength = 20; // seconds
const maxTeams = 8;

io.on('connection', (socket) => {
  if (socket.handshake && socket.handshake.headers && socket.handshake.headers.cookie) {
    var raw = cookie.parse(socket.handshake.headers.cookie)[name];
    if (raw) {
      // The cookie set by express-session begins with s: which indicates it
      // is a signed cookie. Remove the two characters before unsigning.
      socket.sessionId = signature.unsign(raw.slice(2), secret) || undefined;
    }
  }
  let userID = "";
  if (socket.sessionId) {
    store.get(socket.sessionId, function(err, session) {
      try {
        userID = session.passport.user;
      } catch (error) {
        console.log(error);
      }
    });
  }
  if (draftStarted) {
    socket.emit('draft_started');
  }

  socket.on("get_start", () => {
    if (draftStarted) {
      socket.emit('set_start', userList["ID:"+userIDList[0]].name, userList["ID:"+userIDList[1]].name);
    }
  });

  socket.on('start_draft', async () => {
    if (userID !== "cf3a7c") { return; }
    if (draftStarted) { return; }
    console.log("draft started");
    draftStarted = true;
    io.emit('draft_started');
    await initializeDraft();
    io.emit('set_start', userList["ID:"+userIDList[0]].name, userList["ID:"+userIDList[1]].name);
    setTimeout(startTimer, 300000, true);
  });

  socket.on('team_picked', (number, name) => {
    if (!draftStarted) { return; }
    console.log("team picked");
    if (userID === userIDList[0]) {
      let location = isValidTeam(number, userID);
      if (location != null) {
        userIDList.push(userIDList.shift());
        userList["ID:"+userID].current_teams += number+",";
        if (userList["ID:"+userID].current_teams.split(",").length > maxTeams) {
          userIDList.pop();
        }
        if (userIDList.length <= 1) {
          nextUser = "-";
        }
        else {
          nextUser = userList["ID:"+userIDList[1]].name;
        }
        socket.emit('team_added', number, name, location);
        teamList["team"+number].owner = userList["ID:"+userID].name;
        pickedTeamsList["team"+number] = teamList["team"+number]
        delete teamList["team"+number];
        if (userIDList.length <= 0) {
          io.emit('team_removed', number, nextUser, nextUser);
          draftStarted = false;
          saveData();
        }
        else {
          io.emit('team_removed', number, userList["ID:"+userIDList[0]].name, nextUser);
          startTimer(true);
          io.emit('get_next_team');
        }
      }
      else {
        startTimer(true);
        socket.emit('wrong_next_team');
      }
    } 
  });
});

function isValidTeam(number, id) {
  try {
    let userTeams = userList["ID:"+id].current_teams.toString().split(",");
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
          return null;
        }
      }
    }
    return currentTeam.location;
  } catch (error) {
    return null;
  }
}

async function initializeDraft() {
  var users = await sqlConnection.SQLResponse.getUserIDs(connection);
  for (let i = 0; i < users.length; i++) {
    user = users[i]
    userList["ID:"+user.id] = {
      "name": user.name,
      "current_teams": "",
    };
    userIDList.push(user.id);
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
      } while (isValidTeam(number, user) == null);
      teamList["team"+number].owner = userList["ID:"+user].name;
      pickedTeamsList["team"+number] = teamList["team"+number]
      delete teamList["team"+number];

      userIDList.push(userIDList.shift());
      userList["ID:"+user].current_teams += number+",";
      if (userList["ID:"+user].current_teams.split(",").length > maxTeams) {
        userIDList.pop();
      }
      if (userIDList.length <= 1) {
        nextUser = "-";
      }
      else {
        nextUser = userList["ID:"+userIDList[1]].name;
      }
      if (userIDList.length <= 0) {
        io.emit('team_removed', number, nextUser, nextUser);
        draftStarted = false;
        saveData();
      }
      else {
        io.emit('team_removed', number, userList["ID:"+userIDList[0]].name, nextUser);
        startTimer(true);
        io.emit('get_next_team');
      }
    }
  }
}

async function saveData() {
  console.log("Draft ended");
  await sqlConnection.SQLResponse.draftEnded(connection, userList, pickedTeamsList);
  io.emit("draft_ended")
}