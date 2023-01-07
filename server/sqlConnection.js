const { resolve } = require('path');

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
                    console.log(res);
                    return resolve(res);
                });
            });
        }
    }

    static async verifyUser(conn, user, passw) {
        return new Promise((resolve, reject)=>{
            conn.query('SELECT id, name, passw FROM users WHERE name = "'+user+'" AND passw = "'+passw+'"',  (queryError, res)=>{
                if(queryError){
                    return reject(queryError);
                }
                return resolve(res);
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
