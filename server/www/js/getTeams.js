async function getTeams() {
  const port = 3000;

  await fetch('http://localhost:'+port+'/allow-cors/teams', {mode:'cors'}).then(resp => {
    resp.json().then(data => {

      var html = "<table border='1|1'>";
      data.forEach(element => {
        html+="<tr>";
        html+="<td>"+element.name+"</td>";
        html+="<td>"+element.number+"</td>";
        html+="<td>"+element.opr+"</td>";
        html+="<td>"+element.average+"</td>";
        html+="<td>"+element.score+"</td>";
        html+="<td>"+element.location+"</td>";
        html+="<td>"+element.owner+"</td>";
        html+="</tr>";
      });
      html+="</table>";
      document.getElementById("teams").innerHTML = html;
    });
  });
};
