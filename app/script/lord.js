var queryHero = require('./../../app/data/mysql').queryHero;
var envConfig = require('./../../app/config/env.json');
var config = require('./../../app/config/'+envConfig.env+'/config');
var mysql = require('mysql');
 
var pomelo = require('./../../app/data/pomelo.js');

var client = mysql.createConnection({
  host: config.mysql.host,
  user: config.mysql.user,
  port:config.mysql.port,
  password: config.mysql.password,
  database: config.mysql.database
});


var monitor = function(){
  if (typeof actor!='undefined'){
    var args = Array.prototype.slice.call(arguments,1);
    actor.emit(arguments[0],args,actor.id);
  } else {
    console.error(Array.prototype.slice.call(arguments,0));
  }
}

var connected = false;

var offset = typeof actor!='undefined' ? actor.id : 0;

console.log(offset + ' ' + actor.id);

queryHero(client,1,offset,function(error,users){
   var user = users[0];
    queryEntry('1',function(host,port){
     entry(host,port,user.token,function(){
      connected = true;
    })
  });
});

function queryEntry(uid, callback) {
  pomelo.init({host: config.apps.host, port: config.apps.port, log: true}, function() {
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

//set debug level
//robot.logLevel(1);
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
  monitor('monitorEnd','enterScene');
  pomelo.entities = data.entities;
  pomelo.player = data.curPlayer;
  var moveRandom = Math.floor(Math.random()*3+1);
  var intervalTime = 2000+Math.round(Math.random()*3000);
  if (moveRandom<=10) {
    setInterval(function(){moveEvent()},intervalTime);
    console.log(' mover,name=' + pomelo.player.name + ' ' + pomelo.player.entityId);
  } else { 
    setInterval(function(){attackEvent()},intervalTime);
    console.log(' fighter,name=' + pomelo.player.name + ' ' + pomelo.player.entityId);
  }
}


var sendChat = function() {
  msgTempate.content = '捡到一个XXOO的玩意';
  pomelo.request('chat.chatHandler.send',msgTempate,okRes);
}

/**
 * 处理用户离开请求
 */
 pomelo.on('onUserLeave',function(data){
    //console.log("用户离开: " + JSON.stringify(data));
    var player = pomelo.players[data.playerId];
    if (!!player) {
    clearAttack(player);
    delete pomelo.entities[player.entityId]
    delete player;
  }
});


pomelo.on('onAddEntities', function(entities){
    //console.log('onAddEntities%j',entities);
    for(var key in entities){
        var array = entities[key];
        var typeEntities = pomelo.entities[key] || [];
        for(var i = 0; i < array.length; i++){
           //duplicate
          typeEntities.push(array[i]);
        }
        pomelo.entities[key] = typeEntities;
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
        var array = pomelo.entities[key];
        var typeEntities = pomelo.entities[key] || [];
        var indexs = [];
        for(var i = 0;i<typeEntities.length;i++){
           var exists = typeEntities[i];
           if (exists.entityId===entityId){
              indexs.push(i);
           }
        }
        for(var i = 0;i<indexs.length;i++){
            typeEntities.splice(i,1);
        }
    }
}
/**
 * 处理用户攻击请求
 */
 pomelo.on('onAttack',function(data){
  //console.log("fighting: " + JSON.stringify(data));
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
    //console.log(' ON revive %j',pomelo.player.id + ' ' + pomelo.uid);
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
    pomelo.entities[item.entityId] = item;
  }
});
 

 pomelo.on('onMove',function(data){ 
  var entity = pomelo.entities[data.entityId];
  if (!entity) {return;}
  if (data.entityId ===pomelo.player.entityId) {
    var path = data.path[1];
    pomelo.player.x = path.x;
    pomelo.player.y = path.y;
    console.log(' self %j move to x=%j,y=%j',pomelo.uid,path.x,path.y);
  }
  pomelo.entities[data.entityId] = entity;    
});
 
var moveDirection = 1+Math.floor(Math.random()*7);

 var getPath = function() {
  var FIX_SPACE = Math.round(Math.random()*pomelo.player.walkSpeed);
  var startX = pomelo.player.x;
  var startY = pomelo.player.y;
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
  if (!typeEntities){return null;}
  var randomNum = Math.floor(Math.random()*typeEntities.length);
  var entity =  typeEntities[randomNum];
  if (!!entity) {
    entity.type = type;
  } else {
    for (var i = 0;i<typeEntities.length;i++){
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
  monitor('monitorStart','move');
  pomelo.request('area.playerHandler.move',msg,function(data){
    monitor('monitorEnd','move');
    if (data.code !=200) {
      console.error('wrong path %j entityId= %j',msg,pomelo.player.entityId);
      return moveDirection++;
    }
    pomelo.player.x = paths[1].x;
    pomelo.player.y = paths[1].y;
    if (moveDirection>=8){ moveDirection = 1+Math.floor(Math.random()*5);}
  });
}


var attackEvent = function(){
  if (!pomelo.player.entityId || !!pomelo.isDead ) {
    return;
  }
  var entity = pomelo.lastAttAck;
  if (!!entity) {
      attack(entity);
      var count = fightedMap[entity.entityId] ||1;
      fightedMap[entity.entityId] = (count+1);
      if (count>=10) {
        delete fightedMap[entity.entityId];
        clearAttack(entity);
      }
  } else {
     attack(getFirstFight());
  }
};

 
var attack = function(entity) {
  if (!entity) {return;}
  if (entity.type === 'mob') {
    pomelo.lastAttAck = entity;
    console.log(' last attack ' + entity.entityId)
    var attackId = entity.entityId;
    var skillId = 1;
    var route = 'area.fightHandler.attack';
    var areaId = pomelo.player.areaId;
    var msg = {areaId:areaId,playerId: pomelo.player.id, targetId:attackId, skillId: skillId};
    monitor('monitorStart','attack');
    pomelo.request(route,msg,function(data){
      monitor('monitorEnd','attack');
    });
  } else if (entity.type === 'item' || entity.type === 'equipment') {
    var route = 'area.playerHandler.pickItem';
    var attackId = entity.entityId;
    var msg = { areaId:pomelo.player.areaId, playerId:pomelo.player.id, targetId:attackId};
    //console.log(' begin pickup == %j , %j ',entity.type,msg); 
    monitor('monitorStart','pickItem');
    pomelo.request(route,msg,function(data){
      monitor('monitorEnd','pickItem');
    });
  }
}

/*
 *ITEM ACTION
 *
 */
 pomelo.on('onPickItem', function(data){
  clearAttack(data.item);
  var item = pomelo.entities[data.item];
    //console.log('pic %j',data);
    if (!!item && data.player===pomelo.player.entityId) {
      msgTempate.content = '捡到一个XXOO的'+ item.kindName+'玩意';
    //robot.request(msgTempate);
  }
  delete item;
});

 pomelo.on('onRemoveItem', function(data){
  clearAttack(data);
  delete pomelo.entities[data.entityId];
});

var clearAttack = function(data){
   pomelo.lastAttAck = null;
}

var removeAttack = function(){
  pomelo.lastAttAck = null;
}





};