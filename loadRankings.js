function loadRankings() {
    var tbodyRef = document.getElementById('rankings').getElementsByTagName('tbody')[0];
    
    // Insert a row at the end of table
    var team = tbodyRef.insertRow();
    
    // Insert a cell at the end of the row
    var name = team.insertCell();
    var teams = team.insertCell();
    var points = team.insertCell();
    
    // Append a text node to the cell
    name.appendChild(document.createTextNode('Aidan'));
    teams.appendChild(document.createTextNode('2451/254/111'));
    points.appendChild(document.createTextNode('1300'));
}