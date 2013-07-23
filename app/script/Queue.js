var amqp = require('amqp');
var amqpServerInfo = {
		"host": "114.113.199.220",
		"port": 5672,
		"login": "guest",
		"password": "guest",
		"vhost": "/"
};
var QUEUE_NAME = {
    IOS_QUEUE: '4.ios',
    ANDROID_QUEUE: '4.android'
 };

var messageId = 0;
var domains = ['blog.163.com', 'news.163.com', 'cloud.163.com'];
var offline = [true, false];
var platforms = ['iOS', 'andriod'];
var msgNumber = 0;

/**
 * Create message to test dynamically. Each item is different.
 *
 */
var createMessage = function (platForm,type){

	var message = {
		msgId: randomNumber(0, 10000000000000000000),
		sourceDomain: randomDomain(),
		message: {
			title: "message_" + randomString(5),
			count: randomNumber(0, 20),
			sound: "ping.aiff",
			notifyType: randomNumber(0, 2),
			content: randomString(50),
			msgNumber: ++msgNumber
		},
		ttl: 30 * 60,
		offline: randomOffline(),
		filters: randomFilter(type),
		timestamp: new Date().getTime()
	}

	return message;
}

var randomString = function(count){
	var x = "poiuytrewqasdfghjklmnbvcxzQWERTYUIPLKJHGFDSAZXCVBNM";
	var tmp="";
 	for(var i = 0; i < count; i++) {
 		tmp += x.charAt(Math.ceil(Math.random()*100000000) % x.length);
 	}
 	return tmp;
}

var randomNumber = function(min, max){
	return Math.floor(Math.random() * (max- min) + min); 
}

var randomDomain = function (){
	var i = randomNumber(0, 2);
	return domains[i];
}

var randomOffline = function(){
	var i = randomNumber(0, 1);
	return offline[i];
}

var randomPlatform = function() {
	var i = randomNumber(0, 2);
	return platforms[i];
}

var randomFilter = function(testI){
	switch(parseInt(testI)) {
		case 0: 
			return {
				platform: 'iOS',
        user: 'wz@163.com',
				domain: 'blog.163.com'
			};
			break;

		case 1: {
			return {
				platform: 'andriod',
				domain: 'blog.163.com'
			};
			break;
			}
		case 2:
			return {
				domain: 'blog.163.com',
				user: 'zxc792@163.com'
			};
			break;
		case 3:
			return {
				domain: 'news.163.com',
				user: 'pengyang@126.com'
			};
			break;
		case 4:
			return {
				domain: 'blog.163.com',
				user: 'test@163.com'
			}
	}
	return;
	}


/**
 * The message productor. Product message to RabbitMQ as the productClient.
 *
 */
var connection = amqp.createConnection({
	host: amqpServerInfo.host,
	port: amqpServerInfo.port,
	login: amqpServerInfo.login ,
	password: amqpServerInfo.password,
	vhost: amqpServerInfo.vhost
});


connection.addListener('close', function (e) {
  if (e) {
    throw e;
  } else {
    console.log('connection closed.');
  }
});

connection.addListener('ready', function () {
  console.log("connected to " + connection.serverProperties.product);
	connection.exchange('exchange.push', {
			passive: true,
			durable: true
		}, function(exc) {
			console.log("the exchange: exchange-push has been created!")
	for(var item in QUEUE_NAME) {
		var queueName = QUEUE_NAME[item];
		(function(queueName) {
			connection.queue(queueName, {durable: true, autoDelete: false}, function(queue) {
				console.log("the queue: " + queueName + " has been created!");
				queue.bind(exc, "message-route-" + queueName);
				console.log("the queue: " + queueName + " has been bind to exchange-push!");
				publishMessage(exc, queueName);			
			});
		 })(queueName);
	}
	});
});
 
var publishMessage = function(exchange, platForm) {
	var type = 0;
	var interval = 1000;
	setInterval(function(){
		var msg =	createMessage(platForm,type);
		console.log(msg);
		exchange.publish("message-route-" + platForm, msg, {
			mandatory: true,
			immediate: false
		});
	}, interval);
}

