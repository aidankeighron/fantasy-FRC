const url =  window.location.origin;

function getPickedTeam(index) {
  try {
    table = document.getElementById("queue");
    number = table.rows[2].cells[index];
    return number.textContent || number.innerText;
  } 
  catch (error) {
    return -1;
  }
}

function addToTable(number, name, location, tableID) {
  try {
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
    row.insertCell(2).innerHTML = location;
    if (tableID !== "my-team") {
      row.insertCell(3).innerHTML = '<td><button onclick="removeFromTable('+"'"+number+'queue'+"'"+')">Remove</button></td>';
    }
    if (tableID === "queue") {
      pickNextTeam();
    }
  }
  catch (error) {
    alert("ERROR");
    console.log(error);
  }
}

function removeFromTable(id) {
  try {
    document.getElementById(id).remove();
  } catch (error) { }
}

// type: 0 = string, 1 = double
function sortTable(row, type, table, forward) {
  try {
    var table, rows, switching, i, x, y, shouldSwitch;
    table = document.getElementById(table);
    switching = true;
    while (switching) {
      switching = false;
      rows = table.rows;
      for (i = 2; i < (rows.length - 1); i++) {
        shouldSwitch = false;
        x = rows[i].getElementsByTagName("td")[row];
        y = rows[i + 1].getElementsByTagName("td")[row];
        if (type == 0) {
          if (forward) {
            if (x.innerHTML.toLowerCase() > y.innerHTML.toLowerCase()) {
              shouldSwitch = true;
              break;
            }            
          }
          else {
            if (x.innerHTML.toLowerCase() < y.innerHTML.toLowerCase()) {
              shouldSwitch = true;
              break;
            }
          }
        }
        else {
          if (forward) {
            if (parseFloat(x.innerHTML) > parseFloat(y.innerHTML)) {
              shouldSwitch = true;
              break;
            }
          }
          else {
            if (parseFloat(x.innerHTML) < parseFloat(y.innerHTML)) {
              shouldSwitch = true;
              break;
            }
          }
        }
      }
      if (shouldSwitch) {
        rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
        switching = true;
      }
    }
  }
  catch (error) {
    alert("ERROR");
    console.log(error);
  }
}

function search(tableID, nameCol, numCol) {
  try {
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
  catch (error) {
    alert("ERROR");
    console.log(error);
  }
}

  async function loadTeams() {
  try {
    await fetch(url+'/allow-cors/all-teams', {mode:'cors'}).then(resp => {
      resp.json().then(data => {
        var html = "<input class='search' type='text' id='search' onkeyup='search("+'"team-list-table"'+", 1, 0)' placeholder='Search in table...' autocomplete='off'>";
        html+="<table id='team-list-table' class='table'>";
        html+= "<tr><thead>";
        html+= '<th>Number</th>';
        html+= '<th>Name</th>';
        html+= '<th>EPA</th>';
        html+= '<th>Location</th>'
        html+= "</thead></tr>";
        
        if (data["teams"][0] != null) {
          for (let i = 0; i < data["teams"].length; i++) {
            team = data["teams"][i]
            html+="<tr id="+team.number+"team-list>";
            html+="<td>"+team.number+"</td>";
            html+="<td>"+team.name+"</td>";
            html+="<td>"+team.epa+"</td>";
            html+="<td>"+team.location+"</td>"
            html+='<td><button onclick="addToTable('+team.number+', '+"'"+team.name+"'"+', '+"'"+team.location+"'"+", 'queue'"+')">Add</button></td>';
            html+="</tr>";
          }
          
          html+="</table>";
          document.getElementById("team-list").innerHTML = html;
        } 
        else {
          Object.entries(data["teams"]).forEach(team => {
            html+="<tr id="+team[1].number+"team-list>";
            html+="<td>"+team[1].number+"</td>";
            html+="<td>"+team[1].name+"</td>";
            html+="<td>"+team[1].epa+"</td>";
            html+="<td>"+team[1].location+"</td>";
            html+='<td><button onclick="addToTable('+team[1].number+', '+"'"+team[1].name+"'"+', '+"'"+team[1].location+"'"+", 'queue'"+')">Add</button></td>';
            html+="</tr>";
          });
          
          html+="</table>";
          document.getElementById("team-list").innerHTML = html;
        }
      });
    });
  }
  catch (error) {
    alert("ERROR");
    console.log(error);
  }
}

function loadMyTeams(teams) {
  try {
    var html ="<table id='my-team' class='table'>";
    html+= "<tr><thead>";
    html+= '<th>Number</th>';
    html+= '<th>Name</th>';
    html+= '<th>Location</th>'
    html+= "</thead></tr>";
    
    Object.entries(teams).forEach(team => {
      html+="<tr>";
      html+="<td>"+team[1].number+"</td>";
      html+="<td>"+team[1].name+"</td>";
      html+="<td>"+team[1].location+"</td>"
      html+="</tr>";
    });
    
    html+="</table>";
    document.getElementById("my-team-container").innerHTML = html;
  }
  catch (error) {
    alert("ERROR");
    console.log(error);
  }
}