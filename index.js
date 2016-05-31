var express = require('express');
var app = express();

var releaseMode = false;

process.argv.forEach(function (val, index, array) {
  if(val.toLowerCase().indexOf('release') > 0){
    releaseMode = true;
  }
});

var staticResourceFolder = releaseMode ? '/dist' : '/public';

app.get('/', function(req, res){
    res.redirect('/elasticsearch-connector.html')
});

// Serve everything from the same flat folder in the base web server path
app.use(express.static(__dirname + staticResourceFolder));

app.disable('etag');

var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Elasticsearch Tableau Web Data connector server listening at http://%s:%s', host, port);
});