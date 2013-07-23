	var copyArray = function(dest,doffset,src,soffset,length){
		for(var index = 0;index<length;index++){
			dest[doffset++] = src[soffset++];
		}
	};

	(function(){
		var count = 100000;
		var src = new Buffer(count);
		src.fill("h");
		var dest = new Buffer(count);
	 	var start = Date.now();
	 	for (var i=0;i<=count;i++){
	 		copyArray(dest,0,src,0,count);
	 	}

	 	var diff = Date.now() - start;

	 	console.log(diff);

	 	start = Date.now();

	 	for (var i=0;i<=count;i++){
	 		src.copy(dest,0,0,count)
 	 	}

	 	var diff2 = Date.now() - start;

		console.log(diff2);

	})()