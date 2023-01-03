function teamAdded(team) {

}

function addToTable(number, name, table) {
    var table = document.getElementById(table);
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
    row.insertCell(2).innerHTML = '<td><button onclick="removeFromTable('+"'"+number+'queue'+"'"+')">Remove</button></td>';
}

function removeFromTable(id) {
    document.getElementById(id).remove();
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

function search(table_id, name_col, num_col) {
    var input, filter, table, tr, td, i, txtValue;
    input = document.getElementById("search");
    filter = input.value.toLowerCase();
    table = document.getElementById(table_id);
    tr = table.getElementsByTagName("tr");
    for (i = 0; i < tr.length; i++) {
      td = tr[i].getElementsByTagName("td")[num_col];
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
        td = tr[i].getElementsByTagName("td")[name_col];
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

function loadTeams() {
    var html = "<input type='text' id='search' onkeyup='search("+'"team-list-table"'+", 1, 0)' placeholder='Search in table...' autocomplete='off'>";
    html+="<table border='1|1' id='team-list-table'>";
    html+= "<tr>";
    html+= '<th>Number<button onclick="sortTable(0, 1, '+"'"+'team-list-table'+"'"+')">Sort</button></th>';
    html+= '<th>Name<button onclick="sortTable(1, 0, '+"'"+'team-list-table'+"'"+')">Sort</button></th>';
    html+= '<th>OPR<button onclick="sortTable(2, 1, '+"'"+'team-list-table'+"'"+')">Sort</button></th>';
    html+= "</tr>";

    html+="<tr id=111>";
    html+="<td>111</td>";
    html+="<td>Wildstang</td>";
    html+="<td>62.3</td>";
    html+='<td><button onclick="addToTable(111, '+"'Wildstang'"+', '+"'queue'"+')">Add</button></td>';
    html+="</tr>";

    html+="<tr id=254>";
    html+="<td>254</td>";
    html+="<td>Cheesy Poofs</td>";
    html+="<td>30.2</td>";
    html+='<td><button onclick="addToTable(254, '+"'Cheesy Poofs'"+', '+"'queue'"+')">Add</button></td>';
    html+="</tr>";

    html+="<tr id=2451>";
    html+="<td>2451</td>";
    html+="<td>PWNAGE</td>";
    html+="<td>90.6</td>";
    html+='<td><button onclick="addToTable(2541, '+"'PWNAGE'"+', '+"'queue'"+')">Add</button></td>';
    html+="</tr>";

    html+="</table>";
    document.getElementById("team-list").innerHTML = html;
}