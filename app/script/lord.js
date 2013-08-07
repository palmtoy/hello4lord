var queryHero = require('./../../app/data/mysql').queryHero;
var envConfig = require('./../../app/config/env.json');
var config = require('./../../app/config/'+envConfig.env+'/config');
var mysql = require('mysql');

var pomelo = require('./../../app/data/pomelo.js');
var selfPlayer = null;
var selfUid = null;

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
  selfPlayer = null;
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
      selfUid = player.userId;
      selfPlayer = player;
      msgTempate.uid = selfUid;
      msgTempate.playerId = selfPlayer.id;
      msgTempate.from = selfPlayer.name,
        msgTempate.areaId = selfPlayer.areaId;
      setTimeout(function(){
        enterScene();
      },1000);
    }
  };

  login(data);

  var enterScene = function() {
    var msg = {uid:selfUid, playerId: selfPlayer.id, areaId: selfPlayer.areaId};
    monitor('monitorStart','enterScene');
    pomelo.request("area.playerHandler.enterScene",msg,enterSceneRes);
  }

  var enterSceneRes = function(data) {
    monitor('monitorEnd', 'enterScene');
    pomelo.entities = data.entities;
    selfPlayer = data.curPlayer;
    var moveRandom = Math.floor(Math.random()*3+1);
    var intervalTime = 2000 + Math.round(Math.random()*3000);
    /*
       if (moveRandom<=10) {
       setInterval(function(){moveEvent()},intervalTime);
       console.log(' mover,name=' + selfPlayer.name + ' ' + selfPlayer.entityId);
       } else { 
       setInterval(function(){attackEvent()},intervalTime);
       console.log(' fighter,name=' + selfPlayer.name + ' ' + selfPlayer.entityId);
       }
       */
    setInterval(function() {
      // console.log('%s : is running ... playerId = %d, fighter = %s, intervalTime = %d',
        // Date(), selfPlayer.id, selfPlayer.name, intervalTime);
      attackEvent()
    }, intervalTime);
    console.log('playerId = %d, fighter = %s, intervalTime = %d',
      selfPlayer.id, selfPlayer.name, intervalTime);
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
      var selfId = parseInt(selfPlayer.entityId);
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
    if (data.entityId === selfPlayer.entityId) {
      pomelo.isDead = false;
      clearAttack();
    }
  });


  pomelo.on('onUpgrade' , function(data){
    if (data.player.id===selfPlayer.id){   
      msgTempate.content = 'NB的我升'+data.player.level+'级了，羡慕我吧';
      pomelo.level = data.player.level;    
      sendChat();
    }
  });


  pomelo.on('onDropItems' , function(data) {
    var items = data.dropItems;
    for (var i = 0; i < items.length; i ++) {
      var item = items[i];
      pomelo.entities[EntityType.ITEM][item.entityId] = item;
    }
  });


  pomelo.on('onMove',function(data){ 
    var entity = pomelo.entities[EntityType.PLAYER][data.entityId];
    if (!entity) {
      return;
    }
    if (data.entityId === selfPlayer.entityId) {
      var path = data.path[1];
      selfPlayer.x = path.x;
      selfPlayer.y = path.y;
      console.log('self %j move to x=%j, y=%j', selfUid, path.x, path.y);
    }
    pomelo.entities[EntityType.PLAYER][data.entityId] = entity;
  });

  var moveDirection = 1+Math.floor(Math.random()*7);

  var getPath = function() {
    var FIX_SPACE = Math.round(Math.random()*selfPlayer.walkSpeed);
    var startX = selfPlayer.x;
    var startY = selfPlayer.y;
    var endX = startX;
    var endY = startY;
    switch(moveDirection) {
      case 1:
        endX+=FIX_SPACE;break;
      case 2:
        endX+=FIX_SPACE;
        endY+=FIX_SPACE;
        break;
      case 3:
        endY+=FIX_SPACE;
        break;
      case 4:
        endY+=FIX_SPACE;
        endX-=FIX_SPACE;
        break;
      case 5:
        endX-=FIX_SPACE;
        break;
      case 6:
        endX-=FIX_SPACE;
        endY-=FIX_SPACE;
        break;
      case 7 :
        endX-=FIX_SPACE;
        break;
      case 8 :
      default:
        endX+=FIX_SPACE;
        endY-=FIX_SPACE;
        break;
    }
    var path = [{x: startX, y: startY}, {x:endX, y:endY}];
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
    var nearEntity = getFightPlayer('mob');
    if (!nearEntity) { nearEntity = getFightPlayer('item')};
    if (!nearEntity) { nearEntity = getFightPlayer('player')};
    return nearEntity;
  }

  var okRes = function(){

  }

  var moveEvent = function() {
    if (!!pomelo.isDead) {return;}
    var paths= getPath();
    var msg = {path:paths};
    monitor('monitorStart', 'move');
    pomelo.request('area.playerHandler.move', msg, function(data) {
      monitor('monitorEnd', 'move');
      if (data.code !== 200) {
        console.error('wrong path %j entityId = %j', msg, selfPlayer.entityId);
        return ++moveDirection;
      }
      selfPlayer.x = paths[1].x;
      selfPlayer.y = paths[1].y;
      if (moveDirection >= 8) {
        moveDirection = 1 + Math.floor(Math.random()*5);
      }
    });
  }

  var attackEvent = function(){
    /*
     console.log('1 ~ %d~%s is attacking, in area %d, pos(%d, %d)',
     selfPlayer.id, selfPlayer.name, selfPlayer.areaId,
     selfPlayer.x, selfPlayer.y);
     */
    if (!selfPlayer.entityId || !!pomelo.isDead ) {
      return;
    }
    /*
     console.log('2 ~ %d~%s is attacking, in area %d, pos(%d, %d)',
     selfPlayer.id, selfPlayer.name, selfPlayer.areaId,
     selfPlayer.x, selfPlayer.y);
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
          Date(), selfPlayer.id, selfPlayer.name, entity.entityId,
          selfPlayer.areaId, selfPlayer.x, selfPlayer.y);
      var attackId = entity.entityId;
      var skillId = 1;
      var route = 'area.fightHandler.attack';
      var areaId = selfPlayer.areaId;
      // var msg = { areaId: areaId, playerId: selfPlayer.id, targetId:attackId, skillId: skillId};
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
      // var msg = { areaId:selfPlayer.areaId, playerId:selfPlayer.id, targetId:attackId};
      var msg = {areaId: selfPlayer.areaId, playerId: selfPlayer.id, targetId: attackId};
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
    if (!!item && data.player === selfPlayer.entityId) {
      msgTempate.content = '捡到一个XXOO的'+ item.kindName+'玩意';
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

