/////////////////////////////////////////////////////////////
var WebSocket = require('ws');
var Protocol = require('pomelo-protocol');
var Package = Protocol.Package;
var Message = Protocol.Message;
var EventEmitter = require('events').EventEmitter;
var protocol = require('pomelo-protocol');
var protobuf = require('pomelo-protobuf');
var utils = require('./../../app/script/utils');
var moverStat = require('./../../app/script/statistic');

  if (typeof Object.create !== 'function') {
    Object.create = function (o) {
      function F() {}
      F.prototype = o;
      return new F();
    };
  }

  var JS_WS_CLIENT_TYPE = 'js-websocket';
  var JS_WS_CLIENT_VERSION = '0.0.1';

  var RES_OK = 200;
  var RES_FAIL = 500;
  var RES_OLD_CLIENT = 501;

  var pomelo = Object.create(EventEmitter.prototype); // object extend from object
  var socket = null;
  var reqId = 0;
  var callbacks = {};
  var handlers = {};
  //Map from request id to route
  var routeMap = {};

  var heartbeatInterval = 5000;
  var heartbeatTimeout = heartbeatInterval * 2;
	var nextHeartbeatTimeout = 0;
	var gapThreshold = 100; // heartbeat gap threshold
  var heartbeatId = null;
  var heartbeatTimeoutId = null;

	var handshakeCallback = null;

  var handshakeBuffer = {
    'sys':{
			type: JS_WS_CLIENT_TYPE,
      version: JS_WS_CLIENT_VERSION
    },
    'user':{
    }
  };

  var initCallback = null;

  pomelo.init = function(params, cb){
    pomelo.params = params;
    params.debug = true;
    initCallback = cb;
    var host = params.host;
    var port = params.port;

    var url = 'ws://' + host;
    if(port) {
      url +=  ':' + port;
    }

    if (!params.type) {
      console.log('init websocket');
      handshakeBuffer.user = params.user;
			handshakeCallback = params.handshakeCallback;
      this.initWebSocket(url,cb);
    }
  };

  pomelo.initWebSocket = function(url,cb){
    console.log(url);
    var onopen = function(event){
      console.log('[pomeloclient.init] websocket connected!');
      var obj = Package.encode(Package.TYPE_HANDSHAKE, Protocol.strencode(JSON.stringify(handshakeBuffer)));
      send(obj);
    };
    var onmessage = function(event) {
      processPackage(Package.decode(event.data), cb);
      // new package arrived, update the heartbeat timeout
      if(heartbeatTimeout) {
        nextHeartbeatTimeout = Date.now() + heartbeatTimeout;
      }
    };
    var onerror = function(event) {
      pomelo.emit('io-error', event);
      console.log('socket error %j ',event);
    };
    var onclose = function(event){
      pomelo.emit('close',event);
      console.log('socket close %j ',event);
    };
    socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    socket.onopen = onopen;
    socket.onmessage = onmessage;
    socket.onerror = onerror;
    socket.onclose = onclose;
  };

  pomelo.disconnect = function() {
    if(socket) {
      if(socket.disconnect) socket.disconnect();
      if(socket.close) socket.close();
      console.log('disconnect');
      socket = null;
      }

    if(heartbeatId) {
      clearTimeout(heartbeatId);
      heartbeatId = null;
    }
    if(heartbeatTimeoutId) {
      clearTimeout(heartbeatTimeoutId);
      heartbeatTimeoutId = null;
    }
  };

  pomelo.request = function(route, msg, cb) {
    msg = msg||{};
    route = route || msg.route;
    if(!route) {
      console.log('fail to send request without route.');
      return;
    }

    reqId++;
    sendMessage(reqId, route, msg);

    callbacks[reqId] = cb;
    routeMap[reqId] = route;
  };

  pomelo.notify = function(route, msg) {
    sendMessage(0, route, msg);
  };

  var sendMessage = function(reqId, route, msg) {
    var type = reqId ? Message.TYPE_REQUEST : Message.TYPE_NOTIFY;

    //compress message by protobuf
    var protos = !!pomelo.data.protos?pomelo.data.protos.client:{};
    if(!!protos[route]){
      msg = protobuf.encode(route, msg);
    }else{
      msg = Protocol.strencode(JSON.stringify(msg));
    }


    var compressRoute = 0;
    if(pomelo.dict && pomelo.dict[route]){
      route = pomelo.dict[route];
      compressRoute = 1;
    }

    msg = Message.encode(reqId, type, compressRoute, route, msg);
    var packet = Package.encode(Package.TYPE_DATA, msg);
    send(packet);
  };

  var send = function(packet){
    socket.send(packet.buffer || packet,{binary: true, mask: true});
  };


  var handler = {};

  var heartbeat = function(data) {
    var obj = Package.encode(Package.TYPE_HEARTBEAT);
    if(heartbeatTimeoutId) {
      clearTimeout(heartbeatTimeoutId);
      heartbeatTimeoutId = null;
    }

    if(heartbeatId) {
      // already in a heartbeat interval
      return;
    }

    heartbeatId = setTimeout(function() {
      heartbeatId = null;
      send(obj);

			nextHeartbeatTimeout = Date.now() + heartbeatTimeout;
      heartbeatTimeoutId = setTimeout(heartbeatTimeoutCb, heartbeatTimeout);
    }, heartbeatInterval);
  };

  var heartbeatTimeoutCb = function() {
    var gap = nextHeartbeatTimeout - Date.now();
    if(gap > gapThreshold) {
      heartbeatTimeoutId = setTimeout(heartbeatTimeoutCb, gap);
    } else {
      console.error('server heartbeat timeout');
      pomelo.emit('heartbeat timeout');
      pomelo.disconnect();
    }
  };

  var handshake = function(data){
    data = JSON.parse(Protocol.strdecode(data));
    if(data.code === RES_OLD_CLIENT) {
      pomelo.emit('error', 'client version not fullfill');
      return;
    }

    if(data.code !== RES_OK) {
      pomelo.emit('error', 'handshake fail');
      return;
    }

    handshakeInit(data);

    var obj = Package.encode(Package.TYPE_HANDSHAKE_ACK);
    send(obj);
    if(initCallback) {
      initCallback(socket);
      initCallback = null;
    }
  };

  var onData = function(data){
    //probuff decode
    //var msg = Protocol.strdecode(data);
    var msg = Message.decode(data);

    if(msg.id > 0){
      msg.route = routeMap[msg.id];
      delete routeMap[msg.id];
      if(!msg.route){
        return;
      }
    }

    msg.body = deCompose(msg);

    processMessage(pomelo, msg);
  };

  var onKick = function(data) {
    pomelo.emit('onKick');
  };

  handlers[Package.TYPE_HANDSHAKE] = handshake;
  handlers[Package.TYPE_HEARTBEAT] = heartbeat;
  handlers[Package.TYPE_DATA] = onData;
  handlers[Package.TYPE_KICK] = onKick;

  var processPackage = function(msg){
    handlers[msg.type](msg.body);
  };

  var processMessage = function(pomelo, msg) {
    if(!msg){
      console.error('error');
    }
    if(!msg.id) {
      // server push message
      pomelo.emit(msg.route, msg.body);
    }

    //if have a id then find the callback function with the request
    var cb = callbacks[msg.id];

    delete callbacks[msg.id];
    if(typeof cb !== 'function') {
      return;
    }

    cb(msg.body);
    return;
  };

  var processMessageBatch = function(pomelo, msgs) {
    for(var i=0, l=msgs.length; i<l; i++) {
      processMessage(pomelo, msgs[i]);
    }
  };

  var deCompose = function(msg){
    var protos = !!pomelo.data.protos?pomelo.data.protos.server:{};
    var abbrs = pomelo.data.abbrs;
    var route = msg.route;

    try {
    //Decompose route from dict
    if(msg.compressRoute) {
      if(!abbrs[route]){
        console.error('illigle msg!');
        return {};
      }

      route = msg.route = abbrs[route];
    }
    if(!!protos[route]){
      return protobuf.decode(route, msg.body);
    }else{
      return JSON.parse(Protocol.strdecode(msg.body));
    }
    } catch(ex) {
      console.error('route  ,body ' +  route + " " + msg.body);
    }
    return msg;
  };

  var setDict = function(dict) {
    if(!dict){
      return;
    }

    pomelo.dict = dict;
    pomelo.abbrs = {};

    for(var route in dict){
      pomelo.abbrs[dict[route]] = route;
    }
  };

  var initProtos = function(protos){
    if(!protos){return;}

    pomelo.protos = {
      server : protos.server || {},
      client : protos.client || {}
    },

    protobuf.init({encoderProtos: protos.client, decoderProtos: protos.server});
  };

  var handshakeInit = function(data){
    if(data.sys && data.sys.heartbeat) {
      heartbeatInterval = data.sys.heartbeat * 1000;   // heartbeat interval
      heartbeatTimeout = heartbeatInterval * 2;        // max heartbeat timeout
    } else {
      heartbeatInterval = 0;
      heartbeatTimeout = 0;
    }

    initData(data);

    if(typeof handshakeCallback === 'function') {
      handshakeCallback(data.user);
    }
  };

  //Initilize data used in pomelo client
  var initData = function(data){
    pomelo.data = pomelo.data || {};
    var dict = data.sys.dict;
    var protos = data.sys.protos;

    //Init compress dict
    if(!!dict){
      pomelo.data.dict = dict;
      pomelo.data.abbrs = {};

      for(var route in dict){
        pomelo.data.abbrs[dict[route]] = route;
      }
    }

    //Init protobuf protos
    if(!!protos){
      pomelo.data.protos = {
        server : protos.server || {},
        client : protos.client || {}
      };
      if(!!protobuf){
        protobuf.init({encoderProtos: protos.client, decoderProtos: protos.server});
      }
    }
  };

/////////////////////////////////////////////////////////////

var queryHero = require('./../../app/data/mysql').queryHero;
var envConfig = require('./../../app/config/env.json');
var config = require('./../../app/config/'+envConfig.env+'/config');
var mysql = require('mysql');

pomelo.player = null;
pomelo.uid = null;

var client = mysql.createConnection({
  host: '10.120.144.102',
  user: 'xy',
  port: 3306,
  password: 'dev',
  database: 'Pomelo'
});

var EntityType = {
  PLAYER: 'player',
  NPC: 'npc',
  MOB: 'mob',
  EQUIPMENT: 'equipment',
  ITEM: 'item'
};

var monitor = function(){
  if (typeof actor !== 'undefined'){
    var args = Array.prototype.slice.call(arguments,1);
    actor.emit(arguments[0],args,actor.id);
  } else {
    console.error(Array.prototype.slice.call(arguments,0));
  }
}

var connected = false;

var offset = typeof actor!='undefined' ? actor.id : 0;

if (typeof actor !== 'undefined'){
  console.log(offset + ' ' + actor.id);
}

queryHero(client,1,offset,function(error,users){
  var user = users[0];
  queryEntry('1',function(host,port){
    entry(host,port,user.token,function(){
      connected = true;
    })
  });
});

function queryEntry(uid, callback) {
  pomelo.init({host: '114.113.202.141', port: 3014, log: true}, function() {
    pomelo.request('gate.gateHandler.queryEntry', { uid: uid}, function(data) {
      pomelo.disconnect();
      if(data.code === 2001) {
        alert('Servers error!');
        return;
      }
      callback(data.host, data.port);
    });
  });
}

function entry(host, port, token, callback) {
  //初始化socketClient
  pomelo.init({host: host, port: port, log: true}, function() {
    monitor('monitorStart','entry');
    pomelo.request('connector.entryHandler.entry', {token: token}, function(data) {
      //var player = data.player;
      monitor('monitorEnd','entry');  
      if (callback) {
        callback(data.code);
      }

      if (data.code == 1001) {
        alert('Login fail!');
        return;
      } else if (data.code == 1003) {
        alert('Username not exists!');
        return;
      }

      if (data.code != 200) {
        alert('Login Fail!');
        return;
      }

      // init handler
      //loginMsgHandler.init();
      //gameMsgHandler.init();
      afterLogin(pomelo,data);
    });
  });
}


var afterLogin = function(pomelo,data){
  pomelo.player = null;
  pomelo.players = {};
  pomelo.entities = {};
  pomelo.isDead = false;
  pomelo.lastAttack = null;
  pomelo.bags = [];
  pomelo.equipments = [];
  pomelo.areas = [];
  pomelo.skills = [];
  var fightedMap = {};

  pomelo.on('onKick', function() {
    console.log('You have been kicked offline for the same account logined in other place.');
  });

  pomelo.on('disconnect', function(reason) {
    console.log('disconnect invoke!' + reason);
  });

  var msgTempate = {scope:'D41313',content:'老子要杀怪了'};
  /**
   * 处理登录请求
   */
  var login = function(data){
    var player = data.player;
    if (player.id <= 0) { 
      console.log("用户不存在\n uid:" + uid + " code:" + data.code);
    } else {
      pomelo.uid = player.userId;
      pomelo.player = player;
      msgTempate.uid = pomelo.uid;
      msgTempate.playerId = pomelo.player.id;
      msgTempate.from = pomelo.player.name,
        msgTempate.areaId = pomelo.player.areaId;
      setTimeout(function(){
        enterScene();
      },1000);
    }
  };

  login(data);

  var enterScene = function() {
    var msg = {uid:pomelo.uid, playerId: pomelo.player.id, areaId: pomelo.player.areaId};
    monitor('monitorStart','enterScene');
    pomelo.request("area.playerHandler.enterScene",msg,enterSceneRes);
  }

  var enterSceneRes = function(data) {
    monitor('monitorEnd', 'enterScene');
    pomelo.entities = data.entities;
    pomelo.player = data.curPlayer;
    var moveRandom = Math.floor(Math.random()*2 + 1);
    var intervalTime = 2000 + Math.round(Math.random()*3000);
    /*
    if (moveRandom === 1) {
      setInterval(function() {
        moveEvent();
      }, intervalTime);
      console.log('playerId = %d, mover = %s, intervalTime = %d',
        pomelo.player.id, pomelo.player.name, intervalTime);
    } else {
      setInterval(function() {
        attackEvent();
      }, intervalTime);
      console.log('playerId = %d, fighter = %s, intervalTime = %d',
        pomelo.player.id, pomelo.player.name, intervalTime);
    }
    */
    setInterval(function() {
      moveEvent();
    }, intervalTime);
    console.log('playerId = %d, mover = %s, intervalTime = %d',
      pomelo.player.id, pomelo.player.name, intervalTime);
    /*
    setInterval(function() {
      // console.log('%s : is running ... playerId = %d, fighter = %s, intervalTime = %d',
        // Date(), pomelo.player.id, pomelo.player.name, intervalTime);
      attackEvent();
    }, intervalTime);
    console.log('playerId = %d, fighter = %s, intervalTime = %d',
      pomelo.player.id, pomelo.player.name, intervalTime);
    */
  }

  var sendChat = function() {
    msgTempate.content = '捡到一个XXOO的玩意';
    pomelo.request('chat.chatHandler.send',msgTempate,okRes);
  }

  /**
   * 处理用户离开请求
   */
  pomelo.on('onUserLeave',function(data){
    var player = pomelo.players[data.playerId];
    if (!!player) {
      clearAttack(player);
      delete pomelo.entities[EntityType.PLAYER][player.entityId]
    delete player;
    }
  });


  pomelo.on('onAddEntities', function(entities){
    for(var key in entities){
      var array = entities[key];
      var typeEntities = pomelo.entities[key] || [];
      for(var i = 0; i < array.length; i++){
        typeEntities.push(array[i]);
      }
      pomelo.entities[key] = typeEntities;
      // console.log('%j : onAddEntities ~ key = %j', Date(), key);
    }
  });

  /**
   * Handle remove entities message
   * @param data {Object} The message, contains ids to remove
   */
  pomelo.on('onRemoveEntities', function(data){
    var entities = data.entities;
    for(var i = 0; i < entities.length; i++){
      var entityId = entities[i];
      removeEntities(entityId);
    }
  });

  var removeEntities = function(entityId){
    for(var key in pomelo.entities){
      var typeEntities = pomelo.entities[key] || [];
      var indexs = [];
      for(var i = 0; i < typeEntities.length; i++){
        var exists = typeEntities[i];
        if (exists.entityId === entityId){
          indexs.push(i);
        }
      }
      for(var j = 0; j < indexs.length; j++){
        typeEntities.splice(indexs[j], 1);
      }
    }
  }
  /**
   * 处理用户攻击请求
   */
  pomelo.on('onAttack',function(data){
    if (data.result.result === 2) {
      var attackId = parseInt(data.attacker);
      var targetId = parseInt(data.target);
      var selfId = parseInt(pomelo.player.entityId);
      if (attackId === selfId || targetId === selfId) {
        if (targetId !== selfId){
          clearAttack();
          pomelo.isDead = false;
          removeEntities(targetId);
        }  else {
          pomelo.isDead = true;
          clearAttack();
        }
      } else {
        if (!!pomelo.lastAttAck && targetId === pomelo.lastAttAck.entityId) {
          clearAttack();
        } 
        removeEntities(targetId);
      }
    }
  });


  pomelo.on('onRevive', function(data){
    if (data.entityId === pomelo.player.entityId) {
      pomelo.isDead = false;
      clearAttack();
    }
  });


  pomelo.on('onUpgrade' , function(data){
    if (data.player.id===pomelo.player.id){   
      msgTempate.content = 'NB的我升'+data.player.level+'级了，羡慕我吧';
      pomelo.level = data.player.level;    
      sendChat();
    }
  });


  pomelo.on('onDropItems' , function(data) {
    var items = data.dropItems;
    for (var i = 0; i < items.length; i ++) {
      var item = items[i];
      pomelo.entities[EntityType.EQUIPMENT][item.entityId] = item;
    }
  });


  pomelo.on('onMove',function(data){
    // console.log("OnMove ~ data = %j", data);
    var isPlayer = true;
    var entity = null;
    if (pomelo.entities[EntityType.PLAYER]) {
      entity = pomelo.entities[EntityType.PLAYER][data.entityId];
    }
    if (!entity) {
      // console.log("1 ~ OnMove is running ...");
      if (pomelo.entities[EntityType.MOB]) {
        entity = pomelo.entities[EntityType.MOB][data.entityId];
      }
      isPlayer = false;
      if (!entity) {
        return;
      }
    }
    if (data.entityId === pomelo.player.entityId) {
      // console.log("2 ~ OnMove is running ...");
      var path = data.path[1];
      pomelo.player.x = path.x;
      pomelo.player.y = path.y;
      // console.log('self %j move to x=%j, y=%j', pomelo.uid, path.x, path.y);
    }
    if (isPlayer) {
      pomelo.entities[EntityType.PLAYER][data.entityId] = entity;
    } else {
      pomelo.entities[EntityType.MOB][data.entityId] = entity;
    }
  });

  var moveDirection = Math.floor(Math.random()*7 + 1);

  var getPath = function() {
    var FIX_SPACE = Math.floor(Math.random() * pomelo.player.walkSpeed + 1);
    var startX = pomelo.player.x;
    var startY = pomelo.player.y;
    var endX = startX;
    var endY = startY;
    switch(moveDirection) {
      case 1:
        endX += FIX_SPACE;
        break;
      case 2:
        endX += FIX_SPACE;
        endY += FIX_SPACE;
        break;
      case 3:
        endY += FIX_SPACE;
        break;
      case 4:
        endX -= FIX_SPACE;
        endY += FIX_SPACE;
        break;
      case 5:
        endX -= FIX_SPACE;
        break;
      case 6:
        endX -= FIX_SPACE;
        endY -= FIX_SPACE;
        break;
      case 7 :
        endX -= FIX_SPACE;
        break;
      case 8 :
      default:
        endX += FIX_SPACE;
        endY -= FIX_SPACE;
        break;
    }
    var path = [{x: startX, y: startY}, {x: endX, y: endY}];
    return path;
  }

  var getFightPlayer = function(type) {
    var typeEntities = pomelo.entities[type];
    if (!typeEntities) {
      return null;
    }
    var randomNum = Math.floor(Math.random()*typeEntities.length);
    var entity = typeEntities[randomNum];
    if (!!entity) {
      entity.type = type;
    } else {
      for (var i = 0; i < typeEntities.length; i++){
        console.log(typeEntities[i] + ' ' + i);
      }
    }
    return entity;
  }

  var getFirstFight = function() {
    var nearEntity = getFightPlayer(EntityType.MOB);
    if (!nearEntity) { nearEntity = getFightPlayer(EntityType.ITEM)};
    if (!nearEntity) { nearEntity = getFightPlayer(EntityType.PLAYER)};
    return nearEntity;
  }

  var okRes = function(){

  }

  var moveEvent = function() {
    if (!!pomelo.isDead) {return;}
    var paths = getPath();
    var msg = {path: paths};
    monitor('monitorStart', 'move');
    pomelo.request('area.playerHandler.move', msg, function(data) {
      monitor('monitorEnd', 'move');
      if (data.code !== RES_OK) {
        console.error('wrong path %j entityId = %j', msg, pomelo.player.entityId);
        return ++moveDirection;
      }
      pomelo.player.x = paths[1].x;
      pomelo.player.y = paths[1].y;
      if (moveDirection >= 8) {
        moveDirection = Math.floor(Math.random()*5 + 1);
      }
      if (!moverStat.idDict[pomelo.player.id]) {
        moverStat.idDict[pomelo.player.id] = true;
        moverStat.total++;
      }
      console.log('Total mover num = %j', moverStat.total);
      console.log('%s : %d~%s is moving, in area %d, pos(%d, %d)',
        Date(), pomelo.player.id, pomelo.player.name,
        pomelo.player.areaId, pomelo.player.x, pomelo.player.y);
    });
  }

  var attackEvent = function(){
    /*
     console.log('1 ~ %d~%s is attacking, in area %d, pos(%d, %d)',
     pomelo.player.id, pomelo.player.name, pomelo.player.areaId,
     pomelo.player.x, pomelo.player.y);
     */
    if (!pomelo.player.entityId || !!pomelo.isDead ) {
      return;
    }
    /*
     console.log('2 ~ %d~%s is attacking, in area %d, pos(%d, %d)',
     pomelo.player.id, pomelo.player.name, pomelo.player.areaId,
     pomelo.player.x, pomelo.player.y);
     */
    var entity = pomelo.lastAttAck;
    if (!!entity) {
      attack(entity);
      var count = fightedMap[entity.entityId] || 1;
      fightedMap[entity.entityId] = (count+1);
      if (count >= 10) {
        delete fightedMap[entity.entityId];
        clearAttack(entity);
      }
    } else {
      attack(getFirstFight());
    }
  };

  var attack = function(entity) {
    if (!entity) {
      return;
    }
    if (entity.type === 'mob') {
      if (entity.died) {
        return;
      }
      pomelo.lastAttAck = entity;
      console.log('%s : %d~%s attack %d, in area %d, pos(%d, %d)',
          Date(), pomelo.player.id, pomelo.player.name, entity.entityId,
          pomelo.player.areaId, pomelo.player.x, pomelo.player.y);
      var attackId = entity.entityId;
      var skillId = 1;
      var route = 'area.fightHandler.attack';
      var areaId = pomelo.player.areaId;
      // var msg = { areaId: areaId, playerId: pomelo.player.id, targetId:attackId, skillId: skillId};
      var msg = {targetId: attackId};
      monitor('incr', 'attackStart');
      monitor('start','attack', 100);
      /*
         pomelo.request(route, msg, function(data){
         monitor('end','attack', 100);
         monitor('incr', 'attackEnd');
         });
         */
      pomelo.notify(route, msg);
    } else if (entity.type === 'item' || entity.type === 'equipment') {
      var route = 'area.playerHandler.pickItem';
      var attackId = entity.entityId;
      // var msg = { areaId:pomelo.player.areaId, playerId:pomelo.player.id, targetId:attackId};
      var msg = {areaId: pomelo.player.areaId, playerId: pomelo.player.id, targetId: attackId};
      monitor('monitorStart', 'pickItem');
      /*
         pomelo.request(route,msg,function(data){
         monitor('monitorEnd','pickItem');
         });
         */
      pomelo.notify(route, msg);
    }
  }

  /*
   *ITEM ACTION
   *
   */
  pomelo.on('onPickItem', function(data){
    clearAttack(data.item);
    var item = pomelo.entities[EntityType.ITEM][data.item];
    if (!item) {
      item = pomelo.entities[EntityType.EQUIPMENT][data.item];
    }
    if (!!item && data.player === pomelo.player.entityId) {
      msgTempate.content = '捡到一个XXOO的' + item.kindName + '玩意';
    }
    if (item) {
      delete item;
    }
  });

  pomelo.on('onRemoveItem', function(data){
    clearAttack(data);
    delete pomelo.entities[EntityType.ITEM][data.entityId];
    delete pomelo.entities[EntityType.EQUIPMENT][data.entityId];
  });

  var clearAttack = function(data){
    pomelo.lastAttAck = null;
  }

  var removeAttack = function(){
    pomelo.lastAttAck = null;
  }
};

