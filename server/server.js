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
const io = new Server(server);

const config = ini.parse(fs.readFileSync('server_info.ini', 'utf-8'))
const connection = sqlConnection.setupSQLConnection();
const port = 3000;

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
    if (req.query.user === "" || req.query.user === null) {
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
    if (req.query.user === "" || req.query.user === null) {
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

server.listen(port, () =>
  console.log(`Server listening on port ${port}`),
);

io.on('connection', (socket) => {
  socket.on('start_draft', () => {
    io.emit("draft_started");
  });
  socket.on('team picked', (team, user) => {
    console.log("Team: " + team);
    console.log("User: " + user);
  });
});