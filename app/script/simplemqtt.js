var mqtt = require('mqttjs');
var fs = require('fs');

var port = 3010;
var host = 'localhost';
//var host = '114.113.202.154';

var monitor = function(type,name,reqId){
  if (typeof actor!='undefined') {
    actor.emit(type,name,reqId);
  } else {
    console.error(Array.prototype.slice.call(arguments,0));
  }
}


mqtt.createClient(port, host ,function(err,client) {
  
  var events = ['connack', 'puback', 'publish', 'pubcomp', 'suback'];

  for (var i = 0; i < events.length; i++) {
    client.on(events[i], function(packet) {
      console.error(packet);
    });
  }

  client.connect({keepalive: 10000});

  client.on('connack', function(packet) {
     monitor('incr','register');
  });
});

