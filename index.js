var express = require('express');
var app = express();

// Simple routes to serve up the needed components installed via bower
// and the connector HTML file itself served from base path of the web server
app.use('/jquery', express.static(__dirname + '/bower_components/jquery/dist'));
app.use('/bootstrap', express.static(__dirname + '/bower_components/bootstrap/dist'));
app.use('/lodash', express.static(__dirname + '/bower_components/lodash'));
app.use('/moment', express.static(__dirname + '/bower_components/moment'));
app.use('/resources', express.static(__dirname + '/resources'));
app.use(express.static(__dirname + '/connector'));

var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Elasticsearch Tableau Web Data connector server listening at http://%s:%s', host, port);
});