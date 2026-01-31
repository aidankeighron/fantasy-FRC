const { resolve } = require('path');
const bcrypt = require ('bcrypt');
const saltRounds = 10;

class SQLResponse {
    static async getTeams(conn, user) {  
        try {
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
        catch (error) {
            console.log("ERROR:");
            console.log(error);
            return "";
        }
    }

    static async getUserIDs(conn) {
        try {
            return new Promise((resolve, reject)=>{
                conn.query('SELECT name, id FROM users ORDER BY position ASC',  (queryError, res)=>{
                    if(queryError){
                        return reject(queryError);
                    }
                    return resolve(res);
                });
            });
        }
        catch (error) {
            console.log("ERROR:");
            console.log(error);
            return "";
        }
    }

    static async getUsers(conn, user) {
        try {
            if (user == null) {
                return new Promise((resolve, reject)=>{
                    conn.query('SELECT name, teams, score, quals_score, elim_score, position FROM users ORDER BY position ASC',  (queryError, res)=>{
                        if(queryError){
                            return reject(queryError);
                        }
                        return resolve(res);
                    });
                });
            }
            else {
                return new Promise((resolve, reject)=>{
                    conn.query('SELECT name, teams, score, quals_score, elim_score, position FROM users WHERE name = "'+user+'"',  (queryError, res)=>{
                        if(queryError){
                            return reject(queryError);
                        }
                        return resolve(res);
                    });
                });
            }
        }
        catch (error) {
            console.log("ERROR:");
            console.log(error);
            return "";
        }
    }

    static async addUser(conn, user, passw) {
        try {
            return new Promise((resolve, reject)=>{
                conn.query('SELECT name, teams, score, position FROM users WHERE name = "'+user+'"',  (queryError, res)=>{
                    if (res == null || res == "") {
                        let hashedPassw = bcrypt.hashSync(String(passw).replace(/^"(.*)"$/, '$1'), saltRounds);
                        let id = Math.floor((1 + Math.random()) * 0x1000000).toString(16).substring(1);
                        conn.query('INSERT INTO users (name, passw, teams, score, position, id) VALUES ("'+user+'", "'+String(hashedPassw)+'", "", 0, 0, "'+id+'")',  (queryError, res)=>{
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
        catch (error) {
            console.log("ERROR:");
            console.log(error);
            return "Error while adding user";
        }
    }

    static async getPasswordHash(conn) {
        try {
            return new Promise((resolve, reject)=>{
                let hashedPassw = bcrypt.hashSync(String('mad77777').replace(/^"(.*)"$/, '$1'), saltRounds);
                conn.query('UPDATE users SET passw = "'+String(hashedPassw)+'" WHERE name = "'+'Aidan'+'"',  (queryError, res)=>{
                    if(queryError){
                        console.log(queryError);
                    }
                });
                return resolve("Completed");
            });
        }
        catch (error) {
            console.log("ERROR:");
            console.log(error);
            return "Error while adding user";
        }
    }

    static async updatePassword(conn, newPassw, repeatPassw, user) {
        try {
            return new Promise((resolve, reject)=>{
                if (newPassw != null && newPassw != "" && repeatPassw != null && repeatPassw != "" && newPassw == repeatPassw) {
                    let hashedPassw = bcrypt.hashSync(String(newPassw).replace(/^"(.*)"$/, '$1'), saltRounds);
                    conn.query('UPDATE users SET passw = "'+String(hashedPassw)+'" WHERE name = "'+user+'"',  (queryError, res)=>{
                        if(queryError){
                            console.log(queryError);
                        }
                    });
                }
                else {
                    return resolve("Error while changing password");
                }
                return resolve("Completed");
            });
        }
        catch (error) {
            console.log("ERROR:");
            console.log(error);
            return "Error while updating password";
        }
    }

    static async removeUser(conn, user) {
        try {
            return new Promise((resolve, reject)=>{
                conn.query('DELETE FROM users WHERE name = "'+user+'"',  (queryError, res)=>{
                    return resolve("User deleted");
                });
            });
        }
        catch (error) {
            console.log("ERROR:");
            console.log(error);
            return "Error while removing user";
        }
    }

    static async verifyUser(conn, user, passw) {
        try {
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
        catch (error) {
            console.log("ERROR:");
            console.log(error);
            return null;
        }
    }

    static async getUserInfo(conn, id) {
        try {
            return new Promise((resolve, reject)=>{
                conn.query('SELECT id, name, passw FROM users WHERE id = "'+id+'"',  (queryError, res)=>{
                    if(queryError){
                        return reject(queryError);
                    }
                    return resolve(res);
                });
            });
        }
        catch (error) {
            console.log("ERROR:");
            console.log(error);
            return "";
        }
    }

    static async draftEnded(conn, users, teams) {
        try {
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
        catch (error) {
            console.log("ERROR:");
            console.log(error);
        }
    }
};



module.exports = {
    setupSQLConnection: function setupResponse(configOverride) {
        const mysql = require('mysql');
        let config;

        if (configOverride) {
            config = configOverride;
        } else {
            const fs = require('fs');
            const ini = require('ini');
            try {
                config = ini.parse(fs.readFileSync('server_info.ini', 'utf-8'));
            } catch (err) {
                console.error("Error reading server_info.ini and no config provided:", err);
                return null;
            }
        }
        
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
