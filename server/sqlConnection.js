const { resolve } = require('path');
const bcrypt = require ('bcrypt');
const saltRounds = 10;

class SQLResponse {
    static async getTeams(conn, user) {        
        if (user == null) {
            return new Promise((resolve, reject)=>{
                conn.query('SELECT * FROM teams ORDER BY number ASC',  (queryError, res)=>{
                    if(queryError){
                        return reject(queryError);
                    }
                    return resolve(res);
                });
            });
        }
        else {
            return new Promise((resolve, reject)=>{
                conn.query('SELECT * FROM teams WHERE owner = "'+user+'"',  (queryError, res)=>{
                    if(queryError){
                        return reject(queryError);
                    }
                    return resolve(res);
                });
            });
        }
    }

    static async getUserIDs(conn) {
        return new Promise((resolve, reject)=>{
            conn.query('SELECT name, id FROM users ORDER BY position ASC',  (queryError, res)=>{
                if(queryError){
                    return reject(queryError);
                }
                return resolve(res);
            });
        });
    }

    static async getUsers(conn, user) {
        if (user == null) {
            return new Promise((resolve, reject)=>{
                conn.query('SELECT name, teams, score, position FROM users ORDER BY position ASC',  (queryError, res)=>{
                    if(queryError){
                        return reject(queryError);
                    }
                    return resolve(res);
                });
            });
        }
        else {
            return new Promise((resolve, reject)=>{
                conn.query('SELECT name, teams, score, position FROM users WHERE name = "'+user+'"',  (queryError, res)=>{
                    if(queryError){
                        return reject(queryError);
                    }
                    return resolve(res);
                });
            });
        }
    }

    static async addUser(conn, user, passw) {
        return new Promise((resolve, reject)=>{
            conn.query('SELECT name, teams, score, position FROM users WHERE name = "'+user+'"',  (queryError, res)=>{
                if (res == null || res == "") {
                    let hashedPassw = bcrypt.hashSync(String(passw).replace(/^"(.*)"$/, '$1'), saltRounds);
                    let id = Math.floor((1 + Math.random()) * 0x1000000).toString(16).substring(1);
                    conn.query('INSERT INTO users (name, passw, teams, score, position, id) VALUES ('+user+', "'+String(hashedPassw)+'", "", 0, 0, "'+id+'")',  (queryError, res)=>{
                        if(queryError){
                            console.log(queryError);
                        }
                    });
                }
                else {
                    return resolve("Username already exists");
                }
                return resolve("Completed");
            });
        });
    }

    static async verifyUser(conn, user, passw) {
        return new Promise((resolve, reject)=>{
            conn.query('SELECT id, name, passw FROM users WHERE name = "'+user+'"', (queryError, res)=>{
                if (queryError) {
                    return reject(queryError);
                }
                let user_data = Object.values(JSON.parse(JSON.stringify(res[0])));
                let result = bcrypt.compareSync(passw, user_data[2]);
                if (result) {
                    return resolve(res);
                }
                else {
                    return resolve(null);
                }
            });
        });
    }

    static async getUserInfo(conn, id) {
        return new Promise((resolve, reject)=>{
            conn.query('SELECT id, name, passw FROM users WHERE id = "'+id+'"',  (queryError, res)=>{
                if(queryError){
                    return reject(queryError);
                }
                return resolve(res);
            });
        });
    }

    static async draftEnded(conn, users, teams) {
        for (user in users) {
            user = users[user];
            await conn.query('UPDATE users SET teams = '+'"'+String(user.current_teams).slice(0, -1)+'" WHERE name = '+'"'+user.name+'"',  (queryError, res)=>{
                if(queryError){
                    console.log(queryError);
                }
            });
        }
        for (team in teams) {
            team = teams[team];
            await conn.query('INSERT INTO teams (name, number, opr, average, score, location, owner) VALUES ('+'"'+team.name+'", '+team.number+', 0, 0, 0'+', "'+team.location+'"'+', "'+team.owner+'")',  (queryError, res)=>{
                if(queryError){
                    console.log(queryError);
                }
            });
        }
    }
};



module.exports = {
    setupSQLConnection: function setupResponse() {
        const fs = require('fs');
        const ini = require('ini');
        const config = ini.parse(fs.readFileSync('server_info.ini', 'utf-8'));
        
        const mysql = require('mysql');
        
        const sqlServer = mysql.createConnection({
          host: config.SQL.SQL_IP,
          user: config.SQL.SQL_User,
          password: config.SQL.SQL_Passw,
          database: config.SQL.SQL_Database
        });

        sqlServer.connect((error) => {
            if (error) {
                console.log("Error: " + error);
            }
        });

        return sqlServer;
    },
    SQLResponse
};
