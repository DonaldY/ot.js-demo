var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

// localhost:3000 -> index.html
app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

// 对外提供访问
app.use('/ot.js', express.static('ot.js'));
app.use('/node_modules', express.static('node_modules'));

// 监听端口
http.listen(3000, function(){
  console.log('listening on *:3000');
});

var EditorSocketIOServer = require('./ot.js/editor-socketio-server.js');
var server = new EditorSocketIOServer("", [], 1);

// socket 连接就调用
io.on('connection', function(socket) {
  server.addClient(socket);
});
