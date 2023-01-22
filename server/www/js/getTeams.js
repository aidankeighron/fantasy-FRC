const url = window.location.origin;

async function getTeams() {

  await fetch(url+'/allow-cors/teams', {mode:'cors'}).then(resp => {
    resp.json().then(data => {

      var html = "<input class='search' type='text' id='search' onkeyup='search("+'"team-table"'+", 0, 1)' placeholder='Search within table...' autocomplete='off'>";
      html+= "<table border='1|1' id='team-table' class='table'>";
      html+= "<tr><thead>";
      html+= '<th>Name  <button onclick="sortTable(0, 0, '+"'"+'team-table'+"'"+', true)">Sort</button></th>';
      html+= '<th>Number  <button onclick="sortTable(1, 1, '+"'"+'team-table'+"'"+', true)">Sort</button></th>';
      html+= '<th>OPR  <button onclick="sortTable(2, 1, '+"'"+'team-table'+"'"+', false)">Sort</button></th>';
      html+= '<th>Average  <button onclick="sortTable(3, 1, '+"'"+'team-table'+"'"+', false)">Sort</button></th>';
      html+= '<th>Score  <button onclick="sortTable(4, 1, '+"'"+'team-table'+"'"+', false)">Sort</button></th>';
      html+= '<th>Owner  <button onclick="sortTable(5, 0, '+"'"+'team-table'+"'"+', true)">Sort</button></th>';
      html+= "</thead></tr>";

      data.forEach(element => {
        html+="<tr>";
        html+="<td>"+element.name+"</td>";
        html+="<td>"+element.number+"</td>";
        html+="<td>"+element.opr+"</td>";
        html+="<td>"+element.average+"</td>";
        html+="<td>"+element.score+"</td>";
        html+="<td>"+element.owner+"</td>";
        html+="</tr>";
      });
      html+="</table>";
      document.getElementById("teams").innerHTML = html;
    });
  });
};

// type: 0 = string, 1 = double
function sortTable(row, type, table, forward) {
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