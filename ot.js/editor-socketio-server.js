'use strict';

// events 模块只提供了一个对象： events.EventEmitter。
// EventEmitter 的核心就是事件触发与事件监听器功能的封装
var EventEmitter     = require('events').EventEmitter;
var TextOperation    = require('./text-operation');
var WrappedOperation = require('./wrapped-operation');
var Server           = require('./server');
var Selection        = require('./selection');
// util 是一个Node.js 核心模块，提供常用函数的集合，用于弥补核心 JavaScript 的功能 过于精简的不足。
var util             = require('util');

// 构造函数继承
function EditorSocketIOServer (document, operations, docId, mayWrite) {
  // 1. 类似继承 EventEmitter， 可以直接获取 EventEmitter 的属性
  EventEmitter.call(this);
  Server.call(this, document, operations);
  this.users = {};
  this.docId = docId;
  // 2. 若 mayWrite 有值，则赋值 mayWrite
  //    若 mayWrite 无值，则赋值 方法
  this.mayWrite = mayWrite || function (_, cb) { cb(true); };
}

// 使 EditorSocketIOServer 继承 Server
util.inherits(EditorSocketIOServer, Server);
// 调用 extend 方法
extend(EditorSocketIOServer.prototype, EventEmitter.prototype);

function extend (target, source) {
  // 遍历
  for (var key in source) {
    // 是否有对应的 key
    // 感觉这块判断就多余了，直接赋值就行
    if (source.hasOwnProperty(key)) {
      target[key] = source[key];
    }
  }
}

// 添加方法 addClient
EditorSocketIOServer.prototype.addClient = function (socket) {
  var self = this;
  socket
    .join(this.docId) // 加入对应房间
    .emit('doc', { // 广播消息
      str: this.document,
      revision: this.operations.length,
      clients: this.users
    })
    .on('operation', function (revision, operation, selection) { // 监听 operation 事件
      self.mayWrite(socket, function (mayWrite) {
        if (!mayWrite) {
          console.log("User doesn't have the right to edit.");
          return;
        }
        self.onOperation(socket, revision, operation, selection);
      });
    })
    .on('selection', function (obj) { // 监听 selection 事件
      self.mayWrite(socket, function (mayWrite) {
        if (!mayWrite) {
          console.log("User doesn't have the right to edit.");
          return;
        }
        self.updateSelection(socket, obj && Selection.fromJSON(obj));
      });
    })
    .on('disconnect', function () { // 监听 disconnect 事件
      console.log("Disconnect, docId: " + self.docId);

      socket.leave(self.docId);
      self.onDisconnect(socket);
      if (
        (socket.manager && socket.manager.sockets.clients(self.docId).length === 0) || // socket.io <= 0.9
        (socket.ns && Object.keys(socket.ns.connected).length === 0) // socket.io >= 1.0
      ) {
        self.emit('empty-room');
      }
    });
};

// 添加方法 onOperation
EditorSocketIOServer.prototype.onOperation = function (socket, revision, operation, selection) {
  var wrapped;
  try {
    wrapped = new WrappedOperation(
      TextOperation.fromJSON(operation),
      selection && Selection.fromJSON(selection)
    );
  } catch (exc) {
    console.error("Invalid operation received: " + exc);
    return;
  }

  try {
    var clientId = socket.id;
    var wrappedPrime = this.receiveOperation(revision, wrapped);
    console.log("new operation: " + wrapped);
    this.getClient(clientId).selection = wrappedPrime.meta;
    socket.emit('ack');
    socket.broadcast['in'](this.docId).emit(
      'operation', clientId,
      wrappedPrime.wrapped.toJSON(), wrappedPrime.meta
    );
  } catch (exc) {
    console.error(exc);
  }
};

// 添加方法 updateSelection
EditorSocketIOServer.prototype.updateSelection = function (socket, selection) {
  var clientId = socket.id;
  if (selection) {
    this.getClient(clientId).selection = selection;
  } else {
    delete this.getClient(clientId).selection;
  }
  socket.broadcast['in'](this.docId).emit('selection', clientId, selection);
};

// 添加方法 setName
EditorSocketIOServer.prototype.setName = function (socket, name) {
  var clientId = socket.id;
  this.getClient(clientId).name = name;
  socket.broadcast['in'](this.docId).emit('set_name', clientId, name);
};

// 添加方法 getClient
EditorSocketIOServer.prototype.getClient = function (clientId) {
  return this.users[clientId] || (this.users[clientId] = {});
};

// 添加方法 onDisconnect
EditorSocketIOServer.prototype.onDisconnect = function (socket) {
  var clientId = socket.id;
  delete this.users[clientId];
  socket.broadcast['in'](this.docId).emit('client_left', clientId);
};

// 对外提供，使其能被外界引用
module.exports = EditorSocketIOServer;
