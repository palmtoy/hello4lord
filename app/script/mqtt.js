var mqtt = require('mqttjs');
var events = ['connack', 'puback', 'publish', 'pubcomp', 'suback'];

var port = 6002;
// var port = 3011;
// var host = '123.58.180.77';
var host = 'android.push.126.net';
// var host = '114.113.202.163';
// var host = '123.58.180.26';

var id = typeof actor!='undefined'?actor.id:-2;
var deviceId = 'android_' + id;
var fileName = '/tmp/times';
var user = 'zxc792@163.com';
var passed = 'qa1234';
var interval = 20000;
var domain = 'blog.163.com';
var productKey = "94b4b71691a3ee3da605ed4f02696691";
var platform = "android";
var expire_time = "1373965044790";
var nonce = "faLvUuMzPgQAUFwK";
var signature = "8wmHp9eYhMACfIf3J0PJdgVEcFU=";

var timestamp = 0;
var retry = 0;
var isFirst = true;
var lastTimeOut = 0;

var REGISTER = 0;
var REGBIND = 1;
var BIND = 2;
var RECONNECT = 3;

var START = 'start';
var END = 'end';

var monitor = function(type,name,reqId){
  if (typeof actor!='undefined') {
    actor.emit(type,name,reqId);
  } else {
    console.error(Array.prototype.slice.call(arguments,0));
  }
}

var updateTimestamp = function(message) {
  if(!message.topic) {
    return;
  }
  var type = message.topic.split('/')[1];
 
  var payload = JSON.parse(message.payload);
  switch(type) {
    case 'broadcast':
    case 'specify':
      var length = payload.length;
      monitor('incr',type);
      timestamp = payload[length - 1]['timestamp'];
      break;
  }
}

var isDebug = function(){
  if (typeof actor!='undefined'){
    return actor.mode;
  } else {
    return true;
  }
}



var connect = function (port,host) {
  console.time('reset');
  mqtt.createClient(port, host, function(err, client) {
    var act = new Action(client);
    if (err) {
      console.log(err);
      console.timeEnd('reset');
      monitor('incr','connerror');
      lastTimeOut += Math.round(Math.random()*10000);
      setTimeout(function(){
        if (retry<=100000) {
          connect(port,host);
        }
        monitor('incr','reconnect'); 
        console.error(' over ' + retry + ' times ' + lastTimeOut);
        retry++;
      },lastTimeOut);
      return;
    }
    client.on('close',function(event){
      connect(port,host);
    })
    for (var i = 0; i < events.length; i++) {
      client.on(events[i], function(packet) {
        if (!packet) return;
        //if (isDebug()){
          //console.log(packet);
        //}
        updateTimestamp(packet);
        if (!!act[packet.cmd]) {
          act[packet.cmd].apply(act,[packet]);
        }
      });
    }
    client.connect({keepalive: interval, will: {topic: "verify",payload:JSON.stringify({key: "6a60565dc2b2f914ff104de34c06b37b"})}, qos: 1});
    //client.connect({keepalive: interval});
    client.on('connack', function(packet) {
      if (!!isFirst) {
        act.register();
      } else {
        act.reconnect();
      }
      // setInterval(function() {client.pingreq();},30*60*1000);
      setInterval(function() {client.pingreq();},10*1000);
    });
  });
};

connect(port,host);
 
var Action = function(client){
  this.msgId = 1;
  this.client = client;
}

Action.prototype.subscribe = function(client) {
  client.subscribe({messageId: msgId, subscriptions: [{topic: 'shit', qos: 1}]});
}

 

Action.prototype.connack = function(packet){

}

Action.prototype.puback = function(packet){

}

Action.prototype.publish = function(packet){
  var topic = packet.topic;
  var name = topic.substring(topic.indexOf('/')+1,topic.length);
  if (typeof this[name]==='undefined'){
      //console.error('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',packet);
      return;
  }
  this[name](JSON.parse(packet.payload));
}



Action.prototype.pubcomp = function(packet){

}

Action.prototype.suback = function(packet){
}

Action.prototype.specify = function(payload){
  var msgs= payload;
  var ids = [];
  for (var i = 0;i< msgs.length;i++){
      var msg = msgs[i];
      ids.push(msg.msgId);
  }
  this.ack(ids);
}

Action.prototype.ack = function(ids){
  var topic = domain + '/ack';
  var payload = {"user":user,"msgIds":ids};
  this.send(topic,1,payload);
}

 
Action.prototype.register = function() {
  isFirst = false;
  var topic = domain + '/register';
  var payload = {"platform":platform,'deviceId':deviceId,"domain":domain,"productKey":productKey};
  monitor(START,'register',REGISTER);
  monitor('incr','register');
  this.send(topic,1,payload);
}


Action.prototype.registerack = function(payload){
  monitor(END,'register',REGISTER);
  monitor('incr','registerack');
  if (payload.code===200) {
    this.regbind();
  } else {
    monitor('incr','incr ' + payload.code);
  }
}


Action.prototype.send = function(topic,qos,payload) {
  this.msgId++;
  this.client.publish({messageId: this.msgId, topic:topic,qos:qos,payload:JSON.stringify(payload)});
}

Action.prototype.regbind = function(){
  var self = this;
  var topic = domain + '/reg_bind';
  monitor(START,'regbind',REGBIND);
  var payload = {"platform":platform,"user":user,"timestamp":timestamp ,"expire_time":12,"nonce":nonce,"signature":signature,"productKey":productKey,"deviceId":deviceId,"domain":domain};
  self.send(topic,1,payload);
}
 

Action.prototype.bind = function(){
  var topic = domain + '/bind';
  monitor(START,'bind',BIND);
  var payload = {"platform":platform,"user":user,"expire_time":12,"signature":signature,"productKey":productKey,'deviceId':deviceId,"domain":domain};
  this.send(topic,1,payload);
}

Action.prototype.unbind = function(){
  var topic = domain + '/cancel_bind';
  var payload = {"user":user,"platform":platform,"domain":domain};
  this.send(topic,1,payload);
}
 
Action.prototype.reconnect = function(){
  var self = this;
  var topic = domain + '/reconnect';
  monitor(START,'reconnect',RECONNECT);
  var payload = {'deviceId':deviceId,"domain":[domain],"timestamp": timestamp};
  self.send(topic,1,payload);
}

Action.prototype.bindack = function(payload){
 if (payload.code>0) {
    monitor(END,'regbind',REGBIND);
    //console.log(payload);
    //this.login();
  } else {
    monitor('incr','incr ' + payload.code);
  }
}
