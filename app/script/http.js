var http = require('http');

var host = "push.netease.com";

var domain = 'blog.163.com';
var productKey = "94b4b71691a3ee3da605ed4f02696691";
var platform = "android";
var expire_time = "12";
var nonce = "abc12f";
var signature = "NnNMjd6/cfSe/zmEAz9ABhlKqP4=";
var user = 'zxc792@163.com';

var bindMsg = {
    nonce:nonce,
    product_domain: domain,
    product_key: productKey,
    expire_time: expire_time,
    user_account: user,
    product_signature: signature
}

var urlEncode = function(msg) {
    var encodeString = '';
    for (var item in msg) {
        var item_encode = encodeURIComponent(item);
        var value_encode = encodeURIComponent(msg[item]);
        encodeString += item_encode + '="' + value_encode + '",';
    }
    return encodeString.substring(0, encodeString.length - 1).replace("+", "%20").replace("*", "%2A").replace("%7E", "~");
}

//var args = {};

//args.headers = {'m-auth':urlEncode(bindMsg)};

var header = 'nonce=0emLAUw8zhFcdC5D,expire_time=1363886804705,product_signature=hfqXBD04DfTUb88joFXYZYmeXIE%3D,product_domain=blog.163.com,product_key=94b4b71691a3ee3da605ed4f02696691,user_account=lin';

var options = {
    hostname: host,
    port: 80,
    path: '/mplatformadmin/authApi/userBind',
    headers: {'m-auth': header},
    agent:false,
};

var vid = 0;

var monitor = function(type,name,reqId){
  if (typeof actor!='undefined') {
    actor.emit(type,name,reqId);
  } else {
    console.error(Array.prototype.slice.call(arguments,0));
  }
}

function makeRequest(vid) {
    monitor('incr','inproc');
    monitor('incr','req');
    monitor('start','get',vid);
    var req = http.request(options);
    req.setNoDelay();
    req.on('response', function(res) {
        //console.log(res);
        monitor('incr','res');
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
          console.log('BODY: ' + chunk);
        });
        res.on('end', function() {
            monitor('end','get',vid);
            monitor('decr','req');
            monitor('decr','inproc');
        });
        res.on('error', function(error) {
            monitor('incr','errors_resp');
        });
        if (res.statusCode===200){
            monitor('incr','success');
        }
     });
    req.on('error', function(error) {
        monitor('incr','errors_req');
        console.log(error);
    });
    req.end();
}

setInterval(function(){
    makeRequest(vid++);
},10);
 

        
        