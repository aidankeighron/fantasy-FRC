async function getUsers() {
  const port = 3000;
  
  await fetch('http://localhost:'+port+'/allow-cors/users', {mode:'cors'}).then(resp => {
  resp.json().then(data => {
    
    var html = "<table border='1|1' id='users-table'>";
    html+= "<tr>";
    html+= '<th>Name<button onclick="sortTable(0, 0, '+"'"+'users-table'+"'"+')">Sort</button></th>';
    html+= '<th>Teams<button onclick="sortTable(1, 0, '+"'"+'users-table'+"'"+')">Sort</button></th>';
    html+= '<th>Score<button onclick="sortTable(2, 1, '+"'"+'users-table'+"'"+')">Sort</button></th>';
    html+= '<th>Position<button onclick="sortTable(3, 1, '+"'"+'users-table'+"'"+')">Sort</button></th>';
    html+= "</tr>";

    data.forEach(element => {
      html+="<tr>";
      html+="<td>"+element.name+"</td>";
      html+="<td>"+element.teams+"</td>";
      html+="<td>"+element.score+"</td>";
      html+="<td>"+element.position+"</td>";
      html+="</tr>";
    });
    html+="</table>";
    document.getElementById("users").innerHTML = html;
  });
});
};

async function getUser() {
  const port = 3000;

  await fetch('http://localhost:'+port+'/allow-cors/teams?user=true', {mode:'cors'}).then(resp => {
    resp.json().then(data => {
      var html = "<table border='1|1' id='user-table'>";
      html+= "<tr>";
      html+= '<th>Name<button onclick="sortTable(0, 0, '+"'"+'user-table'+"'"+')">Sort</button></th>';
      html+= '<th>Number<button onclick="sortTable(1, 1, '+"'"+'user-table'+"'"+')">Sort</button></th>';
      html+= '<th>OPR<button onclick="sortTable(2, 1, '+"'"+'user-table'+"'"+')">Sort</button></th>';
      html+= '<th>Average<button onclick="sortTable(3, 1, '+"'"+'user-table'+"'"+')">Sort</button></th>';
      html+= '<th>Score<button onclick="sortTable(4, 1, '+"'"+'user-table'+"'"+')">Sort</button></th>';
      html+= '<th>Location<button onclick="sortTable(5, 0, '+"'"+'user-table'+"'"+')">Sort</button></th>';
      html+= "</tr>";

      data.forEach(element => {
        html+="<tr>";
        html+="<td>"+element.name+"</td>";
        html+="<td>"+element.number+"</td>";
        html+="<td>"+element.opr+"</td>";
        html+="<td>"+element.average+"</td>";
        html+="<td>"+element.score+"</td>";
        html+="<td>"+element.location+"</td>";
        html+="</tr>";
      });
      html+="</table>";
      document.getElementById("user_team").innerHTML = html;
    });
  });

  await fetch('http://localhost:'+port+'/allow-cors/users?user=true', {mode:'cors'}).then(resp => {
    resp.json().then(data => {
      document.getElementById("totalPoints").innerHTML = "Score: " + data[0].score;
      document.getElementById("rank").innerHTML = "Rank: " + data[0].position;
    });
  });
};

// type: 0 = string, 1 = double
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
