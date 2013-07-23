var EventEmitter = require('events').EventEmitter;
var io = require('socket.io-client');
var http = require('http');

(function() {
  if (typeof Object.create !== 'function') {
    Object.create = function(o) {
      function F() {}
      F.prototype = o;
      return new F();
    };
  }

  var pomelo = Object.create(EventEmitter.prototype); // object extend from object
  var socket = null;
  var id = 1;
  var callbacks = {};
  var route = "web-connector.messageHandler.";
  var isRegister = false;
  var success = 200;
  var sdk_version = '0.1.0';
  var register_ack = 'register';
  var message_store = {};

  /**
   * Initialize connection to server side
   *
   * @param {String} host server ip address
   * @param {Number} port server port
   * @param {Function} cb callback function
   * @memberOf pomelo
   */
  pomelo.init = function(host, port, cb) {
    var url = 'http://' + host;
    if (port) {
      url += ':' + port;
    }
    // try to connect
    socket = io.connect(url,{transports: ['xhr-polling'],'force new connection':true, reconnect:true, 'try multiple transports':false});
    // connect on server side successfully
    socket.on('connect', function() {
      console.log('[pomeloclient.init] websocket connected!');
      cb();
    });

    socket.on('reconnect', function() {
      console.log('reconnect');
    });

    // receive socket message
    socket.on('message', function(data) {
      console.log('receive',data);
      var msg = null;
      if (typeof data === 'string') {
        msg = JSON.parse(data);
      }
      if (msg instanceof Array) {
        processMessageBatch(msg);
      } else {
        processMessage(msg);
      }  
    });

    // encounter connection error
    socket.on('error', function(err) {
      cb(err);
    });

    socket.on('disconnect', function(reason) {
      pomelo.emit('disconnect', reason);
    });
  };

  /**
   * Send request to server side
   *
   * @param {String} method request type include: bind & cancelBind & getOnlineUser
   * @param {Object} opts request parameters
   * @param {Function} cb callback function
   * @private
   */
  var request = function(method, opts, cb) {
    // if method is not exist
    if (!method) {
      console.error("request message error with no method.");
      return;
    }
    id++;
    callbacks[id] = cb;
    sendMsg(method, opts);
  };

  /**
   * Encode message and send by socket
   *
   * @param {String} method request type include: bind & cancelBind & getOnlineUser
   * @param {Object} msg message need to send
   * @private
   */
  var sendMsg = function(method, msg) {
    // assembly request route
    var path = route + method;
    var rs = {
      id: id,
      route: path,
      msg: msg
    };
    var sg = JSON.stringify(rs);
    try {
      socket.send(sg); 
    } catch(ex) {
      console.log('send error');
    }
  };

  /**
   * Process message in batch
   *
   * @param {Array} msgs message array
   * @private
   */
  var processMessageBatch = function(msgs) {
    for (var i = 0, l = msgs.length; i < l; i++) {
      processMessage(msgs[i]);
    }
    for (var key in message_store) {
      pomelo.emit(key, message_store[key]);
    }
    message_store = {};
  };

  /**
   * Process message
   *
   * @param {Object} msg message need to process
   * @private
   */
  var processMessage = function(data) {
    var msg = data;
    if (typeof data === 'string') {
        msg = JSON.parse(data);
    }
    if (msg.id) {
      //if have a id then find the callback function with the request
      var cb = callbacks[msg.id];
      delete callbacks[msg.id];

      if (typeof cb !== 'function') {
        console.log('[pomeloclient.processMessage] cb is not a function for request ' + msg.id);
        return;
      }

      if (!msg.body) {
        msg.body = msg;
      }

      cb(msg.body);

      // register ack message & store deviceId
      if (msg.body.type === register_ack && msg.body.code == success) {
        isRegister = true;
      }
      return;
    }
    //if no id then it should be a server push message
    else {
      console.error(msg);
      monitor('incr',msg.route);
      if (!message_store[msg.route]) message_store[msg.route] = [msg.body];
      else {
        var arr = message_store[msg.route];
        arr.push(msg.body);
        message_store[msg.route] = arr;
      }
    }

  };


  /**
   * Send domain information on server side
   *
   * @param {Object} opts include domain: product domain & productKey: product key
   * @param  {Function} cb callback function return data include code: response code
   * @memberOf pomelo
   */
  pomelo.register = function(opts, cb) {
    opts.sdk_version = sdk_version;
    request('register', opts, cb);
  };


  /**
   * Send user information on server side
   *
   * @param {Object} opts include domain: product domain & user: user id & signature: user signature & expire_time: signature expire time & nonce: random string & productKey: product key
   * @param  {Function} cb callback function return data include code: response code & user: user id
   * @memberOf pomelo
   */
  pomelo.bind = function(opts, cb) {
    if (isRegister) {
      request('bind', opts, cb);
    } else {
      console.log('cannot bind without registration.');
    }
  };

  /**
   * Delete user information on server side
   *
   * @param {Object} opts include domain: product domain & user: user id
   * @param  {Function} cb callback function return data include code: response code & user: user id
   * @memberOf pomelo
   */
  pomelo.cancelBind = function(opts, cb) {
    request('cancelBind', opts, cb);
  };

  /**
   * Query users status
   *
   * @param {Object} opts include domain: product domain & ids: user id array
   * @param  {Function} cb callback function return data like: {test1: 0, test2: 1}
   * @memberOf pomelo
   */
  pomelo.getOnlineUser = function(opts, cb) {
    request('getOnlineUser', opts, cb);
  };


  pomelo.getOfflineMessage = function(opts, cb) {
    request('getOfflineMessage', opts, cb);
  };

  /**
   * Disconnect from server side
   *
   * @memberOf pomelo
   */
  pomelo.disconnect = function() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  };

  var monitor = function(type,name,reqId){
    if (typeof actor!='undefined') {
      actor.emit(type,name,reqId);
    } else {
      console.error(Array.prototype.slice.call(arguments,0));
    }
  }

  var host = '123.58.180.77';
  //host = 'pomelo5.server.163.org';
  //host = 'fkmm8.photo.163.org';
  //host = "192.168.144.199";
  //host = '127.0.0.1';
  var port = 6003;
  //port = 3031;
  var uid = typeof actor!='undefined'?actor.id:-33;
  var user = 'testvvv' + uid;
  var username = user;

  var login_url = "http://123.58.180.180:8080/test/login/index?account="+ user;
  var send_url = "http://123.58.180.180:8080/test/test/sendInterface";
  var update_time = 30 * 1000;
  var success = 200;
  var domain = "blog.163.com";
  var productKey = "94b4b71691a3ee3da605ed4f02696691";

  var nonce = "";
  var expire_time = 12;
  var signature = "12";
  var timestamp = 0;
  var pomelo_client = pomelo;
  var friendsId = ['xy','abc','py','testvvv99','testvvv98','testvvv94'];
  var register = function() {
      monitor('start','register',2);
      console.time('register');
      pomelo.register({
                domain: domain,
                productKey: productKey
              }, function(data) {
                console.timeEnd('register');
                if (data.code === success) {
                monitor('end','register',2);
                isRegister = true;
                bind2('nA8vcgDWYgYiHkKG','1366883049608','xzm0sznKKF1t5EO8bUyc7Oo4Sr0=');
                // var req = http.get(login_url,function(res){
                //   res.on('data',bindx.bind(this));
                //   req.on('error',function(data){
                //     console.log(data);
                //   });
                // });
            }
         });
  }

  var bindx = function(cdata){
                  var data = cdata+'';
                  var nonce = data.split("&")[0].split("=")[1];
                  var expire_time = data.split("&")[1].split("=")[1];
                  var signature = data.split("&")[2].substring(10);
                  bindx(nonce,expire_time,signature);
  };
  

  var bind2 = function(nonce,expire_time,signature){
                  console.log(nonce + ' ' + expire_time+ ' ' + signature);
                  var msg = {user: user, nonce: nonce, expire_time: expire_time, signature: signature, domain: domain, productKey: productKey };
                  monitor('start','bind',1);
                  pomelo.bind(msg,function(data) {
                    if (data.code === success) {
                      monitor('end','bind',1);
                      //messageRequest(timestamp, 0);
                      usersRequest();
                      setUpdateInterval(update_time);
                      isLogined = true;
                      return;
                    } else {
                      //alert('cannot bind user account.');
                      return;
                    }
                  });
  };
  
  pomelo.init(host, port , register.bind(null));

  var timerId = setInterval(function(){
    if (isRegister){
      clearInterval(timerId)
    } else {
      pomelo.init(host, port , register.bind(null));
    }
  },10000);

  function messageRequest(previousTimestamp, currentTimestamp) {
    // receive same timestamp message
    if (previousTimestamp === currentTimestamp && currentTimestamp !== 0) return;
    pomelo.getOfflineMessage({
      domain: domain,
      user: username,
      preId: previousTimestamp,
      id: currentTimestamp
    }, function(data) {
      for (var i = 0; i < data.length; i++) {
        var message = JSON.parse(data[i]).content;
        timestamp = JSON.parse(data[i]).timestamp;
        message = JSON.parse(message);
        var from = message.fromUser;
        // add sender to friends list
        if (all_users[from] === undefined) {
          friendsId.push(from);
          usersRequest();
        }
        //var target = message.user;
        //var msg = message.content;
        //addMessage(true, msg, from, target);
        //$("#chatHistory").show();
      }
    });
  };

function usersRequest() {
  pomelo_client.getOnlineUser({
    domain: domain,
    ids: friendsId
  }, function(data) {
  });
};

  pomelo_client.on('specify', function(data) {
    //messageRequest(timestamp, data.timestamp);
    timestamp = data.timestamp;
    console.log(data)
  });

  pomelo_client.on('broadcast', function(data) {
    if (isLogined) {
      for (var i = 0; i < data.length; i++) {
        var data = JSON.parse(data[i].content);
        //addMessage(false, data.content);
        //$("#chatHistory").show();
        //tip('broadcast');
      }
    } else {
      alert('broadcast');
    }
  });

  function setUpdateInterval(time) {
    setInterval(function() {
      usersRequest();
    }, time);
  };

  process.on('uncaughtException', function(err) {
    console.error(' Caught exception: ' + err.stack);
  });

})();


