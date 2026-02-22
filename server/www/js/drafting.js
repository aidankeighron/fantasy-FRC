const url = globalThis.location.origin;

function getPickedTeam(index) {
  try {
    const table = document.getElementById("queue");
    if (!table || table.rows.length < 3) return -1;
    const cell = table.rows[2].cells[index];
    return cell ? (cell.textContent || cell.innerText) : -1;
  } 
  catch (error) {
    return -1;
  }
}

function addToTable(number, name, location, tableID) {
  try {
    const table = document.getElementById(tableID);
    if (!table) return;

    if (tableID === "queue" && table.rows.length > 10) { // max teams
      return;
    }

    // Check if already in table
    const existing = document.getElementById(number + tableID);
    if (existing) return;

    const row = table.insertRow(-1);
    row.id = number + tableID;
    row.insertCell(0).innerText = number;
    row.insertCell(1).innerText = name;
    row.insertCell(2).innerText = location;

    if (tableID !== "my-team") {
      const btnCell = row.insertCell(3);
      const btn = document.createElement("button");
      btn.innerText = "Remove";
      btn.onclick = () => removeFromTable(number + tableID);
      btnCell.appendChild(btn);
    }

    if (tableID === "queue") {
      pickNextTeam();
    }
  }
  catch (error) {
    console.error("Error in addToTable:", error);
  }
}

function removeFromTable(id) {
  try {
    const el = document.getElementById(id);
    if (el) el.remove();
  } catch (error) { 
    console.error("Error in removeFromTable:", error);
  }
}

// type: 0 = string, 1 = double
function sortTable(rowIdx, type, tableId, forward) {
  try {
    const table = document.getElementById(tableId);
    if (!table) return;
    const rows = Array.from(table.rows).slice(2); 
    
    rows.sort((a, b) => {
      const x = a.cells[rowIdx].innerText.toLowerCase();
      const y = b.cells[rowIdx].innerText.toLowerCase();
      
      let comparison = 0;
      if (type === 0) {
        comparison = x.localeCompare(y);
      } else {
        comparison = Number.parseFloat(x) - Number.parseFloat(y);
      }
      
      return forward ? comparison : -comparison;
    });
    
    const tbody = table.tBodies[0] || table;
    rows.forEach(row => tbody.appendChild(row));
  }
  catch (error) {
    console.error("Error in sortTable:", error);
  }
}

function search(tableID, nameCol, numCol) {
  try {
    const input = document.getElementById("search");
    if (!input) return;
    const filter = input.value.toLowerCase();
    const table = document.getElementById(tableID);
    if (!table) return;
    const tr = table.getElementsByTagName("tr");
    
    requestAnimationFrame(() => {
      for (let i = 1; i < tr.length; i++) { 
        const tdNum = tr[i].getElementsByTagName("td")[numCol];
        const tdName = tr[i].getElementsByTagName("td")[nameCol];
        let visible = false;

        if (tdNum && tdNum.innerText.toLowerCase().includes(filter)) {
          visible = true;
        } else if (tdName && tdName.innerText.toLowerCase().includes(filter)) {
          visible = true;
        }

        tr[i].style.display = visible ? "" : "none";
      }
    });
  }
  catch (error) {
    console.error("Error in search:", error);
  }
}

async function loadTeams() {
  try {
    const resp = await fetch(url + '/allow-cors/all-teams', { mode: 'cors' });
    const data = await resp.json();
    const teams = Array.isArray(data.teams) ? data.teams : Object.values(data.teams);

    if (!teams || teams.length === 0) return;

    const container = document.getElementById("team-list");
    if (!container) return;
    container.innerHTML = ""; 

    const searchInput = document.createElement("input");
    searchInput.className = "search";
    searchInput.type = "text";
    searchInput.id = "search";
    searchInput.placeholder = "Search in table...";
    searchInput.autocomplete = "off";
    searchInput.onkeyup = () => search("team-list-table", 1, 0);
    container.appendChild(searchInput);

    const table = document.createElement("table");
    table.id = "team-list-table";
    table.className = "table";

    const thead = table.createTHead();
    const headRow = thead.insertRow();
    ["Number", "Name", "EPA", "Location", "Action"].forEach(text => {
      const th = document.createElement("th");
      th.innerText = text;
      headRow.appendChild(th);
    });

    const tbody = document.createElement("tbody");
    table.appendChild(tbody);

    const fragment = document.createDocumentFragment();
    teams.forEach(team => {
      if (!team) return;
      const row = document.createElement("tr");
      row.id = team.number + "team-list";
      
      row.insertCell(0).innerText = team.number;
      row.insertCell(1).innerText = team.name;
      row.insertCell(2).innerText = team.epa;
      row.insertCell(3).innerText = team.location;
      
      const c5 = row.insertCell(4);
      const btn = document.createElement("button");
      btn.innerText = "Add";
      btn.onclick = () => addToTable(team.number, team.name, team.location, 'queue');
      c5.appendChild(btn);
      
      fragment.appendChild(row);
    });

    tbody.appendChild(fragment);
    container.appendChild(table);
  }
  catch (error) {
    console.error("Error in loadTeams:", error);
  }
}

function loadMyTeams(teams) {
  try {
    const container = document.getElementById("my-team-container");
    if (!container) return;
    container.innerHTML = ""; 

    const table = document.createElement("table");
    table.id = "my-team";
    table.className = "table";

    const headRow = table.createTHead().insertRow();
    ["Number", "Name", "Location"].forEach(text => {
      const th = document.createElement("th");
      th.innerText = text;
      headRow.appendChild(th);
    });

    const tbody = document.createElement("tbody");
    table.appendChild(tbody);

    const teamEntries = Object.entries(teams);
    if (teamEntries.length > 0) {
      teamEntries.forEach(([_, team]) => {
        const row = tbody.insertRow();
        row.insertCell(0).innerText = team.number;
        row.insertCell(1).innerText = team.name;
        row.insertCell(2).innerText = team.location;
      });
    }

    container.appendChild(table);
  }
  catch (error) {
    console.error("Error in loadMyTeams:", error);
  }
}
