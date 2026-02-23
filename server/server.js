const fs = require('node:fs');
const sqlConnection = require('./sqlConnection.js');
const express = require('express');
const uuid = require('uuid').v4;
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const bodyParser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const ini = require('ini');
const http = require('node:http');
const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const cookie = require('cookie');
const signature = require('cookie-signature');

let config = {};
try {
  if (fs.existsSync('server_info.ini')) {
    config = ini.parse(fs.readFileSync('server_info.ini', 'utf-8'));
  }
} catch (e) {
  console.log("Warning: Could not read server_info.ini, relying on environment variables.");
}

// Ensure sections exist
if (!config.SQL) config.SQL = {};
if (!config.SERVER) config.SERVER = {};

// Override with Environment Variables
if (process.env.SQL_IP) config.SQL.SQL_IP = process.env.SQL_IP;
if (process.env.SQL_USER) config.SQL.SQL_User = process.env.SQL_USER;
if (process.env.SQL_PASSWORD) config.SQL.SQL_Passw = process.env.SQL_PASSWORD;
if (process.env.SQL_DATABASE) config.SQL.SQL_Database = process.env.SQL_DATABASE;
if (process.env.SECRET) config.SERVER.SECRET = process.env.SECRET;

const connection = sqlConnection.setupSQLConnection(config);
const httpPort = 80;
const SQLRegex = /[;/ "'.,]/;

const adminName = "Aidan";

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
    try {
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
    catch (error) {
      console.log("ERROR:");
      console.log(error);
      return done(null, false, { message: 'Invalid credentials'});
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user = await sqlConnection.SQLResponse.getUserInfo(connection, id);
  done(null, user);
});

const sessionName = 'connect.sid';
const secret = config.SERVER.SECRET;
const store = new FileStore();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(session({
  genid: (req) => {
    return uuid();
  },
  name: sessionName,
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
  try {
    if (req.isAuthenticated()) {
      user = Object.values(JSON.parse(JSON.stringify(req.user[0])))[1];
      if (user === adminName) {
        res.sendFile('www/admin.html', { root: __dirname });
      }
      else {
        res.sendStatus(403);
      }
    }
    else {
      res.redirect('/');
    }
  }
  catch (error) {
    console.log("ERROR:");
    console.log(error);
    res.sendStatus(500);
  }
});

app.get('/rankings', (req, res) => {
  try {
    if (req.isAuthenticated()) {
      res.sendFile('www/rankings.html', { root: __dirname });
    }
    else {
      res.redirect('/');
    }
  }
  catch (error) {
    console.log("ERROR:");
    console.log(error);
    res.sendStatus(500);
  }
});

app.get('/teams', (req, res) => {
  try {
    if (req.isAuthenticated()) {
      res.sendFile('www/teams.html', { root: __dirname });
    }
    else {
      res.redirect('/');
    }
  }
  catch (error) {
    console.log("ERROR:");
    console.log(error);
    res.sendStatus(500);
  }
});

app.get('/drafting', (req, res) => {
  try {
    if (req.isAuthenticated()) {
      res.sendFile('www/drafting.html', { root: __dirname });
    }
    else {
      res.redirect('/');
    }
  }
  catch (error) {
    console.log("ERROR:");
    console.log(error);
    res.sendStatus(500);
  }
});

app.get('/draft_teams', (req, res) => {
  try {
    if (req.isAuthenticated()) {
      res.sendFile('www/draft_teams.html', { root: __dirname });
    }
    else {
      res.redirect('/');
    }
  }
  catch (error) {
    console.log("ERROR:");
    console.log(error);
    res.sendStatus(500);
  }
});

app.get('/how_to', (req, res) => {
  try {
    if (req.isAuthenticated()) {
      res.sendFile('www/how_to.html', { root: __dirname });
    }
    else {
      res.redirect('/');
    }
  }
  catch (error) {
    console.log("ERROR:");
    console.log(error);
    res.sendStatus(500);
  }
});

app.get('/settings', (req, res) => {
  try {
    if (req.isAuthenticated()) {
      res.sendFile('www/settings.html', { root: __dirname });
    }
    else {
      res.redirect('/');
    }
  }
  catch (error) {
    console.log("ERROR:");
    console.log(error);
    res.sendStatus(500);
  }
});

app.get('/trades', (req, res) => {
  try {
    if (req.isAuthenticated()) {
      res.sendFile('www/trades.html', { root: __dirname });
    }
    else {
      res.redirect('/');
    }
  }
  catch (error) {
    console.log("ERROR:");
    console.log(error);
    res.sendStatus(500);
  }
});

app.get('/allow-cors/teams', async (req, res) => {
  try {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.isAuthenticated()) {
      if (req.query.user == "" || req.query.user == null) {
        message = await sqlConnection.SQLResponse.getTeams(connection, req.query.user);
      }
      else {
        let user = Object.values(JSON.parse(JSON.stringify(req.user[0])))[1];
        message = await sqlConnection.SQLResponse.getTeams(connection, user);
      }
      res.send(message);
    }
    else {
      res.sendStatus(401);
    }
  }
  catch (error) {
    console.log("ERROR:");
    console.log(error);
    res.sendStatus(500);
  }
});

app.get('/allow-cors/users', async (req, res) => {
  try {
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
  }
  catch (error) {
    console.log("ERROR:");
    console.log(error);
    res.sendStatus(500);
  }
});

app.get('/allow-cors/all-teams', (req, res) => {
  try {
    res.set('Access-Control-Allow-Origin', '*');
    
    if (req.isAuthenticated()) {
      if (Object.keys(teamList).length !== 0) {
        // Send as a flat array to save overhead on keys
        res.json({ "teams": Object.values(teamList) });
      }
      else {
        res.send(teamsJson);
      }
    }
    else {
      res.sendStatus(401);
    }
  }
  catch (error) {
    console.log("ERROR:");
    console.log(error);
    res.sendStatus(500);
  }
});

app.get('/allow-cors/all-users', (req, res) => {
  try {
    res.set('Access-Control-Allow-Origin', '*');
    
    if (req.isAuthenticated()) {
      if (draftStarted) {
        res.json(JSON.parse(JSON.stringify({userList})));
      }
      else {
        res.send("");
      }
    }
    else {
      res.sendStatus(401);
    }
  }
  catch (error) {
    console.log("ERROR:");
    console.log(error);
    res.sendStatus(500);
  }
});

app.get('/allow-cors/add-user', async (req, res) => {
  try {
    res.set('Access-Control-Allow-Origin', '*');
    user = Object.values(JSON.parse(JSON.stringify(req.user[0])))[1];
    if (req.isAuthenticated() && user === adminName) {
      message = await sqlConnection.SQLResponse.addUser(connection, req.query.user, req.query.passw);
      res.send(message);
    }
    else {
      res.sendStatus(403);
    }
  }
  catch (error) {
    console.log("ERROR:");
    console.log(error);
    res.sendStatus(500);
  }
});

app.get('/allow-cors/update-passw', async (req, res) => {
  try {
    res.set('Access-Control-Allow-Origin', '*');
    user = Object.values(JSON.parse(JSON.stringify(req.user[0])))[1];
    if (req.isAuthenticated()) {
      message = await sqlConnection.SQLResponse.updatePassword(connection, req.query.newpassw, req.query.retypepassw, user);
      res.send(message);
    }
    else {
      res.sendStatus(403);
    }
  }
  catch (error) {
    console.log("ERROR:");
    console.log(error);
    res.sendStatus(500);
  }
});

app.get('/allow-cors/remove-user', async (req, res) => {
  try {
    res.set('Access-Control-Allow-Origin', '*');
    user = Object.values(JSON.parse(JSON.stringify(req.user[0])))[1];
    if (req.isAuthenticated() && user === adminName) {
      message = await sqlConnection.SQLResponse.removeUser(connection, req.query.user);
      res.send(message);
    }
    else {
      res.sendStatus(403);
    }
  }
  catch (error) {
    console.log("ERROR:");
    console.log(error);
    res.sendStatus(500);
  }
});

app.get('/allow-cors/trade/propose', async (req, res) => {
  try {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.isAuthenticated()) {
      let sender = Object.values(JSON.parse(JSON.stringify(req.user[0])));
      let senderId = sender[0];
      
      // We expect receiver ID, sender team number, receiver team number
      let receiverId = req.query.receiver_id;
      let senderTeam = req.query.sender_team;
      let receiverTeam = req.query.receiver_team;

      if (!receiverId || !senderTeam || !receiverTeam) {
        return res.send("Missing keys");
      }

      message = await sqlConnection.SQLResponse.proposeTrade(connection, senderId, receiverId, senderTeam, receiverTeam);
      res.send(message);
    } else {
      res.sendStatus(403);
    }
  } catch (error) {
    console.log("ERROR:", error);
    res.sendStatus(500);
  }
});

app.get('/allow-cors/trade/pending', async (req, res) => {
  try {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.isAuthenticated()) {
      let user = Object.values(JSON.parse(JSON.stringify(req.user[0])));
      let userId = user[0];
      
      let trades = await sqlConnection.SQLResponse.getPendingTrades(connection, userId);
      res.send(JSON.stringify(trades));
    } else {
      res.sendStatus(403);
    }
  } catch (error) {
    console.log("ERROR:", error);
    res.sendStatus(500);
  }
});

app.get('/allow-cors/trade/sent', async (req, res) => {
  try {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.isAuthenticated()) {
      let user = Object.values(JSON.parse(JSON.stringify(req.user[0])));
      let userId = user[0];
      
      let trades = await sqlConnection.SQLResponse.getSentTrades(connection, userId);
      res.send(JSON.stringify(trades));
    } else {
      res.sendStatus(403);
    }
  } catch (error) {
    console.log("ERROR:", error);
    res.sendStatus(500);
  }
});

app.get('/allow-cors/trade/respond', async (req, res) => {
  try {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.isAuthenticated()) {
      let tradeId = req.query.trade_id;
      let action = req.query.action; // 'accepted' or 'rejected'

      if (!tradeId || !action) return res.send("Missing params");

      message = await sqlConnection.SQLResponse.respondToTrade(connection, tradeId, action);
      res.send(message);
    } else {
      res.sendStatus(403);
    }
  } catch (error) {
    console.log("ERROR:", error);
    res.sendStatus(500);
  }
});



server.listen(httpPort, () =>
  console.log(`Server listening on port ${httpPort}`),
);

// DRAFTING //

let userIDList = new Array();
let teamList = {};
let pickedTeamsList = {};
let userList = {};
let draftStarted = false;
const roundLength = 20; // seconds
const startLength = 5; // seconds
const maxTeams = 8;
let startUpEnded = false;

io.on('connection', (socket) => {
  if (socket.handshake && socket.handshake.headers && socket.handshake.headers.cookie) {
    const raw = cookie.parse(socket.handshake.headers.cookie)[sessionName];
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
        socket.join(userID);
      } catch (error) {
        console.log(error);
      }
    });
  }
  if (draftStarted) {
    socket.emit('draft_started');
  }

  socket.on("get_my_teams", () => {
    if (!draftStarted) return;
    try {
      const userTeams = userList["ID:"+userID].current_teams.toString().split(",");
      const teams = {};
      for (const userTeam in userTeams) {
        userTeam = userTeams[userTeam];
        teams["team"+userTeam] = pickedTeamsList["team"+userTeam];
      }
      socket.emit("sending_my_teams", teams);
    }
    catch (error) {
      console.log("ERROR:");
      console.log(error);
    }
  });

  socket.on("get_start", () => {
    if (draftStarted) {
      socket.emit('set_start', userList["ID:"+userIDList[0]].name, userList["ID:"+userIDList[1]].name);
      if (startUpEnded) {
        socket.emit("restart_timer", seconds);
      }
      else {
        socket.emit("restart_timer", startLength);
      }
    }
  });

    socket.on('start_draft', async () => {
    const userRes = await sqlConnection.SQLResponse.getUserInfo(connection, userID);
    const user = userRes && userRes.length > 0 ? Object.values(JSON.parse(JSON.stringify(userRes[0]))) : null;
    if (!user || user[1] !== adminName) { 
        socket.emit('start_draft_error', "Unauthorized: You are not the admin.");
        return; 
    }
    if (draftStarted) { 
        socket.emit('start_draft_error', "Draft has already started.");
        return; 
    }
    startUpEnded = false;
    console.log("draft started");
    draftStarted = true;
    io.emit('draft_started');
    await initializeDraft();
    io.emit('set_start', userList["ID:"+userIDList[0]].name, userList["ID:"+userIDList[1]].name);
    io.emit("restart_timer", startLength);
    setTimeout(startTimer, startLength*1000, true);
  });

  socket.on('team_picked', (number, name) => {
    if (!draftStarted || !startUpEnded) { return; }
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
          io.emit('team_removed', number, nextUser, nextUser, userList["ID:"+userID].name);
          draftStarted = false;
          saveData();
        }
        else {
          io.emit('team_removed', number, userList["ID:"+userIDList[0]].name, nextUser, userList["ID:"+userID].name);
          startTimer(true);
          io.to(userIDList[0]).emit('get_next_team');
          io.emit("restart_timer", roundLength);
        }
      }
      else {
        startTimer(true);
        socket.emit('wrong_next_team', number);
        io.emit("restart_timer", roundLength);
      }
      console.log(userList);
      console.log(userIDList.forEach((id, index) => {
        process.stdout.write(userList["ID:"+id].name + ", ");
      })); 
    }
  });
});

function isValidTeam(number, id) {
  const start = Date.now();
  try {
    let userTeams = userList["ID:"+id].current_teams.toString().split(",");
    let currentTeam;
    for (const key in teamList) {
      const team = teamList[key];
      if (number == team.number) {
        currentTeam = team;
      }
    }
  
    for (const key in pickedTeamsList) {
      const team = pickedTeamsList[key];
      for (const uKey in userTeams) {
        const userTeam = userTeams[uKey];
        if (userTeam == team.number && currentTeam.location == team.location) {
          console.log("invalid team");
          return null;
        }
      }
    }
    const end = Date.now();
    if (end - start > 10) {
      console.log(`[PERF] isValidTeam check took ${end - start}ms`);
    }
    return currentTeam.location;
  } catch (error) {
    console.log(error);
    return null;
  }
}

async function initializeDraft() {
  const users = await sqlConnection.SQLResponse.getUserIDs(connection);
  for (let i = 0; i < users.length; i++) {
    user = users[i]
    userList["ID:"+user.id] = {
      "name": user.name,
      "current_teams": "",
    };
    userIDList.push(user.id);
  }
  userIDList = userIDList
  .map(value => ({ value, sort: Math.random() }))
  .sort((a, b) => a.sort - b.sort)
  .map(({ value }) => value);
  let teams = JSON.parse(teamsJson)["teams"];
  teamList = {}; // Reset
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    teamList["team" + team.number] = {
      "name": team.name,
      "number": team.number,
      "epa": team.epa,
      "location": team.location,
      "owner": ""
    };
  }
}

let timeout;
let seconds;
function startTimer(clicked) {
  if (!startUpEnded) {
    startUpEnded = true;
    startTimer(true);
    io.emit("restart_timer", roundLength);
    io.to(userIDList[0]).emit('get_next_team');
    console.log("picking now");
    return;
  }
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
      console.time("Auto-pick Execution");
      let user = userIDList[0];
      index = 0;
      number = 0;
      const teamValues = Object.values(teamList);
      if (teamValues.length > 0) {
        do {
          number = teamValues[index].number;
          index++;
        } while (isValidTeam(number, user) == null && index < teamValues.length);
      }
      teamList["team"+number].owner = userList["ID:"+user].name;
      pickedTeamsList["team"+number] = teamList["team"+number]
      delete teamList["team"+number];
      console.timeEnd("Auto-pick Execution");

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
        io.emit("restart_timer", roundLength);
        io.to(userIDList[0]).emit('get_next_team');
        console.log(userList);
        console.log(userIDList.forEach((id, index) => {
          process.stdout.write(userList["ID:"+id].name + ", ");
        }));
      }
    }
  }
}

async function saveData() {
  console.log("Draft ended");
  await sqlConnection.SQLResponse.draftEnded(connection, userList, pickedTeamsList);
  io.emit("draft_ended");
}