var hello = module.exports = function(){

}


hello.sayv = function() {
	var i = 0;
	//console.log(require('util').inspect(___stack[1],true,2,2));
	console.log(arguments.callee);
}