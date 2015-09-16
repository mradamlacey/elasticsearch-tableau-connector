var express = require('express');
var app = express();

console.log('New express app instance: ', app);

app.get('/elasticsearch-connector', function (req, res) {
  res.send('Hello World!');
});

app.use('/jquery', express.static(__dirname + '/bower_components/jquery/dist'));
app.use(express.static(__dirname + '/connector'));

console.log('Starting server on port 3000');

var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Example app listening at http://%s:%s', host, port);
});