var express = require('express'),
    http = require('http'),
    webhook = require('gitlab-webhook'),
    app = express(),
    sys = require('sys'),
    exec = require('child_process').exec,
    child, server = app.listen(4000),
    io = require('socket.io').listen(server, {
        log: false
    }),
    Connection = require('ssh2'),
    c = new Connection(),
    request = require("request"),
    state = {
        ssh: false
    }, thisConfig = require("./this.json"),
    config = require("./config.json"),
    //speakeasy = require('speakeasy'),
    ping = require("net-ping"),
    switches = config.switches;

var ACCESS_KEY = "62f4c66393234ddaebd40f657698c7cd47ed4f89a9ff4c0b4061a8958e58";
var SECRET_KEY = "11acaec93bdf45ebc11fb0e51340cc6a79cc4f83aa475ec6e8ff2b608cf3a3f6";
var ENDPOINT = "https://api.push.co/1.0/";

var temp = 19;

if (typeof localStorage === "undefined" || localStorage === null) {
    var LocalStorage = require('node-localstorage').LocalStorage;
    localStorage = new LocalStorage('./scratch');
}

if (localStorage.getItem("clients") === null) {
    localStorage.setItem("clients", JSON.stringify({}));
}

if (localStorage.getItem("log") === null) {
    localStorage.setItem("log", JSON.stringify([]));
}

var log = {
    add: function(action, not) {
        var time = new Date().getTime();
        var previousLog = JSON.parse(localStorage.getItem("log"));

        var element = {
            time: time,
            action: action
        };

        previousLog.push(element);

        log.log = previousLog;

        localStorage.setItem("log", JSON.stringify(previousLog));

        io.sockets.emit("logAdd", element);

        //console.log(action);
        if (not === true) {
            request({
                uri: "https://api.push.co/1.0/push/",
                method: "POST",
                form: {
                    "message": action,
                    "api_key": ACCESS_KEY,
                    "api_secret": SECRET_KEY,
                    "url": "http://home.tomasharkema.nl",
                    "view_type": '1'
                }
            }, function(error, response, body) {
                log.add("NOTIFICATION SEND");
            });
        }
    }
};

log.add("---HELLO HELLO---");
var version = "";
child = exec("git describe", function(error, stdout, stderr) {
    version = stdout;
    log.add(version);
    console.log("VERSION: " + version);
});



var clients = JSON.parse(localStorage.getItem("clients"));
//var clients = {};
var client = {
    set: function(ip, state) {
        clients[ip] = state;
        localStorage.setItem("clients", JSON.stringify(clients));
    },
    get: function(ip) {
        return clients[ip];
    }
};


var i = 0;
switches.forEach(function(item) {


    var lState = localStorage.getItem("light-" + i);

    if (lState !== null) {

        switches[i].state = parseInt(lState);

    }

    i++;
});

app.use(express.bodyParser());
app.use(express.methodOverride());

console.log("Still should fix auth - system");

app.use(express.static(__dirname + '/public'));

app.gitlab('/gitlab', {
    exec: 'git pull && npm install && forever restart server.js',
    token: 'uyDNS6DoFZxCzHxf89pj',
    branches: 'master'
});

state.ssh = false;
state.sshPending = false;

function cConnect() {
    log.add("SSH CONNECT");
    if (state.ssh === false) {
        if (state.sshPending === false) {
            c.connect(thisConfig.sshCred);
            state.sshPending = true;
            log.add("SSH PENDING");
        } else {
            log.add("SSH ALREADY PENDING");
        }
    } else {
        log.add("SSH ALREADY CONNECTED");
    }
}

var flipSwitch = function(a, fn) {

    var q = switches[a];

    var switchTo = "on";
    if (q.state === 0) {
        switchTo = "off";
    }
    var query = "cd /var/www/home/node/executables && sudo ./" + q.brand + " " + q.code + " " + q.
    switch +" " + switchTo + "";

    log.add("FLIP " + q.brand + " " + q.code + " " + q.
        switch +" " + switchTo + "");
    log.add("Zet " + q.name + " " + switchTo, true);
    var fn = function() {
        io.sockets.emit("switched", {
            switch: switches[a],
            id: a
        });

        localStorage.setItem("light-" + a, switches[a].state);
    }

    if (thisConfig.use === "ssh") {
        c.exec(query, function(err, stream) {
            if (err) throw err;
            log.add("EXEC COMMAND");
            stream.on('data', function(data, extended) {
                //console.log((extended === 'stderr' ? 'STDERR: ' : 'STDOUT: ') + data);
            });
            stream.on('end', function() {
                //console.log('Stream :: EOF');
            });
            stream.on('close', function() {
                //console.log('Stream :: close');
            });
            stream.on('exit', function(code, signal) {
                //console.log('Stream :: exit :: code: ' + code + ', signal: ' + signal);
                fn({
                    success: true
                });
                log.add("EXEC COMMAND SUCCESS");
            });

        });

    } else {
        child = exec(query, function(error, stdout, stderr) {
            //sys.print('stdout: ' + stdout);
            //sys.print('stderr: ' + stderr);
            if (error !== null) {
                //console.log('exec error: ' + error);
                fn({
                    success: false
                });
            } else {

                fn({
                    success: true
                });

            }
        });
    }
}

//app.get('/switch/:brand/:code/:switch/:switchTo/', flipSwitch);

app.get('/switches', function(req, res) {

    res.send(JSON.stringify(switches)).end();


});

app.get('/temp/:t', function(req, res) {

    res.send(JSON.stringify(req.params.t)).end();

    if (req.params.t != temp) {

        temp = parseInt(req.params.t);

        log.add("TEMPRATUUR UPDATE: " + temp);
        io.sockets.emit('temp', temp);
    }
});

app.get('/pir/:a/:b', function(req, res) {

    res.send(JSON.stringify(req.params.a)).end();


    log.add("PIR UPDATE: " + req.params.a + ", " + req.params.b);

});

io.sockets.on('connection', function(socket) {
    cConnect();
    networkDiscovery();
    socket.emit('switches', switches);
    socket.emit('devices', config.devices);
    socket.emit('temp', temp);

    socket.emit('log', log.log);

    log.add("NEW CLIENT");

    var ip = "";
    socket.on('me', function(data) {
        ip = data;
        if (ip != "null") {
            client.set(ip, true);

            log.add("NEW CLIENT WITH NAME: " + ip);
        }
        //console.log("emit clients ", clients);
        io.sockets.emit('clients', JSON.stringify(clients));
    });

    socket.on('switch', function(data) {
        if (switches[data.id].state === 1) {
            switches[data.id].state = 0;
        } else {
            switches[data.id].state = 1;
        }
        flipSwitch(data.id, function(res) {

        });

    });

    socket.on("refresh", function() {
        log.add("SSH MANUAL");
        // executes `pwd`
        child = exec("git pull", function(error, stdout, stderr) {
            log.add(stdout);
            if (stdout == "Already up-to-date.") {
                log.add("DO RESTART");
                childd = exec("forever restartall", function(error, stdout, stderr) {});
            }
        });
    });

    socket.emit('state', state);

    socket.on('disconnect', function() {
        client.set(ip, false);
        //console.log("emit clients ", clients);
        io.sockets.emit('clients', JSON.stringify(clients));
        log.add("CLIENT BYE BYE" + ip);
    });

});

//console.log(thisConfig.use);

if (thisConfig.use === "ssh") {

    c.on('ready', function() {
        //console.log('Connection :: ready');
        state.ssh = true;
        state.sshPending = false;
        io.sockets.emit('state', state);
        log.add("SSH CONNECTED");
    });

    c.on('error', function(err) {
        //console.log('Connection :: error :: ' + err);
        state.sshPending = false;
        state.ssh = false;
        io.sockets.emit('state', state);
        log.add("SSH ERROR");
    });
    c.on('end', function() {
        //console.log('Connection :: end');
        state.sshPending = false;
        state.ssh = false;
        io.sockets.emit('state', state);
        log.add("SSH END");
    });
    c.on('close', function(had_error) {
        //console.log('Connection :: close');
        state.sshPending = false;
        cConnect();
        state.ssh = false;
        io.sockets.emit('state', state);
        log.add("SSH CLOSE");
    });

    io.sockets.emit('state', state);

    cConnect();

}



function networkDiscovery() {
    var i = 0;
    log.add("NETWORKDISC EXEC");
    var pingSession = ping.createSession();

    config.devices.forEach(function(item) {

        var self = this;

        //console.log(item);

        pingSession.pingHost(item.ip, function(error, target) {
            if (error) {
                var thisState = 0;
            } else {
                var thisState = 1;
            }
            //console.log(error);
            if (thisState != item.state) {

                item.state = thisState;

                io.sockets.emit('deviceChange', item);

                if (item.state === 1) {
                    log.add("NETWORKDISC " + item.name + " came online");
                    if (item.onSwitchOn !== undefined) {
                        eval(item.onSwitchOn);
                        log.add("AUTOCOMMAND ON " + item.onSwitchOn, true);
                    }
                }
                if (item.state === 0) {
                    log.add("NETWORKDISC " + item.name + " went offline");
                    if (item.onSwitchOff !== undefined) {
                        eval(item.onSwitchOff);
                        log.add("AUTOCOMMAND OFF " + item.onSwitchOff, true);
                    }
                }

            }

        });

        i++;
    });

}

networkDiscovery();

setTimeout(function() {
    log.add("NETWORKDISC FROM TIMEOUT");
    networkDiscovery();

}, 10 * 1000);