//libraries
var tls = require('tls'),
    events = require('events'),
    socks = require('socksv5'),
    ssh2 = require('ssh2');

var flow = new events.EventEmitter(),
    tlsOptions = {
	host:'thecoffeehouse.xyz',
	port:3080
    },
    socket = tls.connect(tlsOptions, function(){
	flow.emit('socket-connected');	
    });
    
socket.on('error', function(err){
	console.log(err);
});

flow.on('socket-connected', function(){
	var buffer = '',
	    initialHandler = function(data){
		buffer += data.toString();
		if (buffer.indexOf('HTTP/1.1 200 Connection Established') > -1) {
			console.log('connected to ssh server');
			socket.removeListener('data', initialHandler);
		
			socket.setMaxListeners(100);
		
			//pass over socket to the ssh client
			flow.emit('do-tunnelling');
		}
	    };

	console.log('connected to proxy server via tls');

	socket.addListener('data', initialHandler);

	socket.write('CONNECT thecoffeehouse.xyz:22 HTTP/1.1\\nHost:thecoffeehouse.xyz\r\n\r\n');
});

flow.on('do-tunnelling', function(){
	var Client = ssh2.Client,
	    conn = new Client();

	console.log('passing tls socket to ssh client');

	//create ssh connection to end point through tls tunnel
	conn.on('ready', function() {
		//create socks5 proxy to pump local traffic through tunnel
		socks.createServer(function(info, accept, deny) {
			conn.forwardOut(info.srcAddr, info.srcPort, info.dstAddr, info.dstPort, function(err, stream) {
				if (err) {
					return deny();
				}

				var clientSocket;
				if (clientSocket = accept(true)) {
					stream.pipe(clientSocket).pipe(stream).on('close', function() {
						console.log('gracefully disconnecting stream');
					});
				} else {
					console.log('stream did not disconnect gracefully');
				}
			});
		}).listen(1080, 'localhost', function() {
			console.log('SOCKSv5 proxy server is listening on localhost:1080');
		}).useAuth(socks.auth.None());
	}).on('error', function(err) {
		deny();
	}).connect({
		sock: socket,
		username: 'username',
		password: 'password'
	});
});