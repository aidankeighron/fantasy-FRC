async function getUsers() {
  const port = 3000;
  
  await fetch('http://localhost:'+port+'/allow-cors/users', {mode:'cors'}).then(resp => {
  resp.json().then(data => {
    
    var html = "<table border='1|1'>";
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
      var html = "<table border='1|1'>";
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
