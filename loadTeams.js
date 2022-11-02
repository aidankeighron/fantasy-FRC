function loadTeams() {
    var tbodyRef = document.getElementById('teams').getElementsByTagName('tbody')[0];
    
    // Insert a row at the end of table
    var team = tbodyRef.insertRow();
    
    // Insert a cell at the end of the row
    var name = team.insertCell();
    var number = team.insertCell();
    var rank = team.insertCell();
    var points = team.insertCell();
    
    // Append a text node to the cell
    name.appendChild(document.createTextNode('PWNAGE'));
    number.appendChild(document.createTextNode('2451'));
    rank.appendChild(document.createTextNode('20/1/0'));
    points.appendChild(document.createTextNode('1300'));
}