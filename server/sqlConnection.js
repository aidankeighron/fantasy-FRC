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
            for (const user of users) {
                await conn.query('UPDATE users SET teams = '+'"'+String(user.current_teams).slice(0, -1)+'" WHERE name = '+'"'+user.name+'"',  (queryError, res)=>{
                    if(queryError){
                        console.log(queryError);
                    }
                });
            }
            for (const team of teams) {
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

    static async proposeTrade(conn, senderId, receiverId, senderTeam, receiverTeam) {
        try {
            return new Promise((resolve, reject) => {
                conn.query('INSERT INTO trades (sender_id, receiver_id, sender_team, receiver_team) VALUES (?, ?, ?, ?)', 
                    [senderId, receiverId, senderTeam, receiverTeam], 
                    (queryError, res) => {
                        if (queryError) return reject(queryError);
                        resolve("Trade proposed");
                    }
                );
            });
        } catch (error) {
            console.log("ERROR:", error);
            return "Error proposing trade";
        }
    }

    static async getPendingTrades(conn, userId) {
        try {
            return new Promise((resolve, reject) => {
                const sql = `
                    SELECT t.*, s.name as sender_name 
                    FROM trades t 
                    JOIN users s ON t.sender_id = s.id 
                    WHERE t.receiver_id = ? AND t.status = 'pending'
                `;
                conn.query(sql, [userId], (queryError, res) => {
                    if (queryError) return reject(queryError);
                    resolve(res);
                });
            });
        } catch (error) {
            console.log("ERROR:", error);
            return [];
        }
    }

    static async getSentTrades(conn, userId) {
        try {
            return new Promise((resolve, reject) => {
                const sql = `
                    SELECT t.*, r.name as receiver_name 
                    FROM trades t 
                    JOIN users r ON t.receiver_id = r.id 
                    WHERE t.sender_id = ? AND t.status = 'pending'
                `;
                conn.query(sql, [userId], (queryError, res) => {
                    if (queryError) return reject(queryError);
                    resolve(res);
                });
            });
        } catch (error) {
            console.log("ERROR:", error);
            return [];
        }
    }

    static async respondToTrade(conn, tradeId, action) {
        // action: 'accepted' or 'rejected'
        if (action !== 'accepted' && action !== 'rejected') return "Invalid action";
        
        try {
            return new Promise((resolve, reject) => {
                conn.beginTransaction(async (err) => {
                    if (err) return reject(err);

                    try {
                        // 1. Get Trade Details
                        const getTrade = () => new Promise((res, rej) => {
                            conn.query('SELECT * FROM trades WHERE id = ?', [tradeId], (e, r) => e ? rej(e) : res(r[0]));
                        });
                        const trade = await getTrade();
                        
                        if (!trade || trade.status !== 'pending') {
                            throw new Error("Trade not available");
                        }

                        // 2. Update Trade Status
                        const updateStatus = () => new Promise((res, rej) => {
                            conn.query('UPDATE trades SET status = ? WHERE id = ?', [action, tradeId], (e, r) => e ? rej(e) : res(r));
                        });
                        await updateStatus();

                        if (action === 'accepted') {
                            // 3. Perform Swap
                            // Get Users to swap teams string
                            const getUser = (id) => new Promise((res, rej) => {
                                conn.query('SELECT id, name, teams FROM users WHERE id = ?', [id], (e, r) => e ? rej(e) : res(r[0]));
                            });
                            
                            const sender = await getUser(trade.sender_id);
                            const receiver = await getUser(trade.receiver_id);

                            // Swap team numbers in comma separated strings
                            const swapTeamInList = (listStr, removeTeam, addTeam) => {
                                let list = listStr.split(',').filter(t => t.trim() !== '' && t != removeTeam);
                                list.push(addTeam);
                                return list.join(',');
                            };

                            const newSenderTeams = swapTeamInList(sender.teams, trade.sender_team, trade.receiver_team);
                            const newReceiverTeams = swapTeamInList(receiver.teams, trade.receiver_team, trade.sender_team);

                            // Update Users
                            const updateUser = (id, teams) => new Promise((res, rej) => {
                                conn.query('UPDATE users SET teams = ? WHERE id = ?', [teams, id], (e, r) => e ? rej(e) : res(r));
                            });
                            
                            await updateUser(sender.id, newSenderTeams);
                            await updateUser(receiver.id, newReceiverTeams);

                            // Update Teams Table Owner
                            const updateTeamOwner = (teamNum, ownerName) => new Promise((res, rej) => {
                                conn.query('UPDATE teams SET owner = ? WHERE number = ?', [ownerName, teamNum], (e, r) => e ? rej(e) : res(r));
                            });

                            await updateTeamOwner(trade.sender_team, receiver.name);
                            await updateTeamOwner(trade.receiver_team, sender.name);
                        }

                        conn.commit((err) => {
                            if (err) return conn.rollback(() => reject(err));
                            resolve(action === 'accepted' ? "Trade accepted and processed" : "Trade rejected");
                        });

                    } catch (error) {
                        conn.rollback(() => {
                            console.log("Transaction Error:", error);
                            reject(error);
                        });
                    }
                });
            });
        } catch (error) {
            console.log("ERROR:", error);
            return "Error processing trade";
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
