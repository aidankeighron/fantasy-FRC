const sqlConnection = require('./sqlConnection.js');
const express = require('express');
const uuid = require('uuid').v4;
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const bodyParser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const ini = require('ini')
const fs = require('fs')

const config = ini.parse(fs.readFileSync('server_info.ini', 'utf-8'))
const app = express();
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

// curl http://localhost:3000 -H "Content-Type: application/json" -d "{\"username\":"Aidan\", \"password\":\"pasword1\"}" -L

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

app.get('/home', (req, res) => {
  if (req.isAuthenticated()) {
    res.sendFile('www/home.html', { root: __dirname });
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

app.get('/allow-cors/teams', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  message = await sqlConnection.SQLResponse.getTeams(connection, req.query.user);
  res.send(message);
});

app.get('/allow-cors/users', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  message = await sqlConnection.SQLResponse.getUsers(connection, req.query.user);
  res.send(message);
});

app.listen(port, () =>
  console.log(`Server listening on port ${port}`),
);