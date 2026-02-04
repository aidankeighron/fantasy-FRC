async function initTrades() {
    await loadUsers();
    await loadMyTeams();
    await loadPendingTrades();
    await loadSentTrades();
}

let allUsers = [];

async function loadUsers() {
    try {
        const response = await fetch('/allow-cors/all-users');
        const data = await response.json();
        const usersObj = data.userList || {};
        
        // Convert object to array and filter out current user (client-side logic needed or just show all)
        // Since we don't strictly know "my" ID here without another call, we'll list everyone.
        // Better: Fetch /allow-cors/users?user= to get "my" info first.
        
        // Let's just list all users from the users endpoint
        const usersSelect = document.getElementById('userSelect');
        usersSelect.innerHTML = '<option value="">Select User...</option>';
        
        Object.values(usersObj).forEach(user => {
             // We need IDs, but this endpoint might return names? 
             // Let's check /allow-cors/all-users output in server.js... 
             // It returns {userList}. userList keys are "ID:xyz".
             
             // Actually server.js /allow-cors/all-users returns userList which is { "ID:123": {name: "Aidan", ...} }
        });
        
        for (const [key, user] of Object.entries(usersObj)) {
            const id = key.replace('ID:', '');
            // Simple check to avoid trading with self (if we could identify self easily, but for now just list all)
            const option = document.createElement('option');
            option.value = id;
            option.text = user.name;
            usersSelect.appendChild(option);
        }
    } catch (e) {
        console.error("Error loading users", e);
    }
}

async function loadMyTeams() {
    // Get my teams
    try {
        const response = await fetch('/allow-cors/teams?user='); // Empty user param = "me"
        const teams = await response.json();
        
        const mySelect = document.getElementById('myTeamSelect');
        mySelect.innerHTML = '<option value="">Select My Team...</option>';
        
        teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team.number;
            option.text = `${team.number} - ${team.name}`;
            mySelect.appendChild(option);
        });
    } catch (e) {
        console.error("Error loading my teams", e);
    }
}

async function loadTheirTeams() {
    const userId = document.getElementById('userSelect').value;
    const theirSelect = document.getElementById('theirTeamSelect');
    theirSelect.innerHTML = '<option value="">Select Their Team...</option>';
    
    if (!userId) return;

    try {
        // First we need the username from the ID because /allow-cors/teams expects a username or empty(me)
        // We can find the name from the select option text
        const select = document.getElementById('userSelect');
        const username = select.options[select.selectedIndex].text;
        
        const response = await fetch(`/allow-cors/teams?user=${username}`);
        const teams = await response.json();
        
        teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team.number;
            option.text = `${team.number} - ${team.name}`;
            theirSelect.appendChild(option);
        });
    } catch (e) {
        console.error("Error loading their teams", e);
    }
}

async function proposeTrade() {
    const receiverId = document.getElementById('userSelect').value;
    const senderTeam = document.getElementById('myTeamSelect').value;
    const receiverTeam = document.getElementById('theirTeamSelect').value;
    
    if (!receiverId || !senderTeam || !receiverTeam) {
        alert("Please select all fields.");
        return;
    }
    
    try {
        const response = await fetch(`/allow-cors/trade/propose?receiver_id=${receiverId}&sender_team=${senderTeam}&receiver_team=${receiverTeam}`);
        const msg = await response.text();
        document.getElementById('proposeMsg').innerText = msg;
        if (msg.includes("proposed")) {
            loadSentTrades();
        }
    } catch (e) {
        console.error("Error proposing trade", e);
    }
}

async function loadPendingTrades() {
    try {
        const response = await fetch('/allow-cors/trade/pending');
        const trades = await response.json();
        
        const container = document.getElementById('pendingTrades');
        if (trades.length === 0) {
            container.innerHTML = "<p>No incoming trades.</p>";
            return;
        }
        
        let html = '<table class="table"><thead><tr><th>From</th><th>You Get</th><th>You Give</th><th>Action</th></tr></thead><tbody>';
        trades.forEach(t => {
            html += `<tr>
                <td>${t.sender_name}</td>
                <td>${t.sender_team}</td>
                <td>${t.receiver_team}</td>
                <td>
                    <button class="action-btn accept-btn" onclick="respond('${t.id}', 'accepted')">Accept</button>
                    <button class="action-btn reject-btn" onclick="respond('${t.id}', 'rejected')">Reject</button>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (e) {
        console.error("Error loading pending trades", e);
    }
}

async function loadSentTrades() {
    try {
        const response = await fetch('/allow-cors/trade/sent');
        const trades = await response.json();
        
        const container = document.getElementById('sentTrades');
        if (trades.length === 0) {
            container.innerHTML = "<p>No sent trades.</p>";
            return;
        }
        
        let html = '<table class="table"><thead><tr><th>To</th><th>You Offer</th><th>You Want</th><th>Status</th></tr></thead><tbody>';
        trades.forEach(t => {
            html += `<tr>
                <td>${t.receiver_name}</td>
                <td>${t.sender_team}</td>
                <td>${t.receiver_team}</td>
                <td>${t.status}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (e) {
        console.error("Error loading sent trades", e);
    }
}

async function respond(tradeId, action) {
    if (!confirm(`Are you sure you want to ${action} this trade?`)) return;
    
    try {
        const response = await fetch(`/allow-cors/trade/respond?trade_id=${tradeId}&action=${action}`);
        const msg = await response.text();
        alert(msg);
        loadPendingTrades();
        // Reload my teams if accepted
        if (action === 'accepted') {
            loadMyTeams();
        }
    } catch (e) {
        console.error("Error responding", e);
    }
}
