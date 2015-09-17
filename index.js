var express = require('express');
var app = express();

// Serve everything from the same flat folder in the base web server path
app.use(express.static(__dirname + '/public'));

var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Elasticsearch Tableau Web Data connector server listening at http://%s:%s', host, port);
});