const port = 3000;

function getPickedTeam(index) {
    try {
        table = document.getElementById("queue");
        number = table.rows[1].cells[index];
        return number.textContent || number.innerText;
    } catch (error) {
        return -1;
    }
}

function addToTable(number, name, tableID) {
    var table = document.getElementById(tableID);
    if (tableID === "queue" && table.rows.length > 10) { // max teams
        return;
    }
    for (let i in table.rows) {
        let row = table.rows[i]
        for (let j in row.cells) {
            let col = row.cells[j]
            try {
                if (col.innerHTML.includes(name)) {
                    return;
                }
            } catch (error) { }
        }  
    }
    var row = table.insertRow(-1);
    row.id = number+"queue";
    row.insertCell(0).innerHTML = name;
    row.insertCell(1).innerHTML = number;
    if (tableID !== "my-team") {
        row.insertCell(2).innerHTML = '<td><button onclick="removeFromTable('+"'"+number+'queue'+"'"+')">Remove</button></td>';
    }
    if (tableID === "queue") {
        pickNextTeam();
    }
}

function removeFromTable(id) {
    try {
        document.getElementById(id).remove();
        if (id === "queue") {
            pickNextTeam();
        }
    } catch (error) { }
}

// type: 0 = string, 1 = int
function sortTable(row, type, table) {
    var table, rows, switching, i, x, y, shouldSwitch;
    table = document.getElementById(table);
    switching = true;
    while (switching) {
      switching = false;
      rows = table.rows;
      for (i = 1; i < (rows.length - 1); i++) {
        shouldSwitch = false;
        x = rows[i].getElementsByTagName("td")[row];
        y = rows[i + 1].getElementsByTagName("td")[row];
        if (type == 0) {
            if (x.innerHTML.toLowerCase() > y.innerHTML.toLowerCase()) {
              shouldSwitch = true;
              break;
            }
        }
        else {
            if (parseFloat(x.innerHTML) > parseFloat(y.innerHTML)) {
                shouldSwitch = true;
                break;
              }
        }
      }
      if (shouldSwitch) {
        rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
        switching = true;
      }
    }
}

function search(tableID, nameCol, numCol) {
    var input, filter, table, tr, td, i, txtValue;
    input = document.getElementById("search");
    filter = input.value.toLowerCase();
    table = document.getElementById(tableID);
    tr = table.getElementsByTagName("tr");
    for (i = 0; i < tr.length; i++) {
      td = tr[i].getElementsByTagName("td")[numCol];
      if (td) {
        txtValue = td.textContent || td.innerText;
        if (!isNaN(parseInt(filter))) {
            if (txtValue.toLowerCase().indexOf(filter) > -1) {
                tr[i].style.display = "";
            } else {
                tr[i].style.display = "none";
            }
            continue;
        }
        td = tr[i].getElementsByTagName("td")[nameCol];
        if (td) {
          txtValue = td.textContent || td.innerText;
            if (txtValue.toLowerCase().indexOf(filter) > -1) {
            tr[i].style.display = "";
            } else {
            tr[i].style.display = "none";
            }
        }
      }       
    }
}

async function loadTeams() {

    await fetch('http://localhost:'+port+'/allow-cors/all-teams', {mode:'cors'}).then(resp => {
    resp.json().then(data => {
        var html = "<input type='text' id='search' onkeyup='search("+'"team-list-table"'+", 1, 0)' placeholder='Search in table...' autocomplete='off'>";
        html+="<table border='1|1' id='team-list-table'>";
        html+= "<tr>";
        html+= '<th>Number<button onclick="sortTable(0, 1, '+"'"+'team-list-table'+"'"+')">Sort</button></th>';
        html+= '<th>Name<button onclick="sortTable(1, 0, '+"'"+'team-list-table'+"'"+')">Sort</button></th>';
        html+= '<th>OPR<button onclick="sortTable(2, 1, '+"'"+'team-list-table'+"'"+')">Sort</button></th>';
        html+= '<th>Location</th>'
        html+= "</tr>";
        for (let i = 0; i < data["teams"].length; i++) {
                team = data["teams"][i]
                html+="<tr id="+team.number+"team-list>";
                html+="<td>"+team.number+"</td>";
                html+="<td>"+team.name+"</td>";
                html+="<td>"+team.opr+"</td>";
                html+="<td>"+team.location+"</td>"
                html+='<td><button onclick="addToTable('+team.number+', '+"'"+team.name+"'"+', '+"'queue'"+')">Add</button></td>';
                html+="</tr>";
            }
        
            html+="</table>";
            document.getElementById("team-list").innerHTML = html;
        });
    });
}