(function () {
  alert("I am here");
})();

const fs = require('fs');
const ini = require('ini');
const config = ini.parse(fs.readFileSync('./server_info.ini', 'utf-8'));

var sqlPassw = config['SQL']['SQL_Passw'];
var sqlIP = config['SQL']['SQL_IP'];
var sqlUser = config['SQL']['SQL_User'];
var sqlDatabase = config['SQL']['SQL_Database'];

var mysql = require('mysql');

var con = mysql.createConnection({
  host: sqlIP,
  user: sqlUser,
  password: sqlPassw
});
console.log("sdasdasd")

con.connect(function(err) {
  if (err) throw err;
  console.log("Connected!");
});

function test() {
  console.log("test");
}