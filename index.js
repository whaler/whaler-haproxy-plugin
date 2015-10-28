'use strict';

var Q = require('q');
var fs = require('fs');
var nunjucks = require('nunjucks');
var Datastore = require('nedb');

module.exports = function(whaler) {
    nunjucks.configure(__dirname + '/templates');

    var console = whaler.require('./lib/console');

    var haproxyDb = new Datastore({
        filename: '/etc/whaler/haproxy.db',
        autoload: true
    });

    require('./domains')(whaler, haproxyDb);
    require('./publish')(whaler, haproxyDb);
    require('./unpublish')(whaler, haproxyDb);

    var pull = Q.denodeify(whaler.docker.pull);
    var createContainer = Q.denodeify(whaler.docker.createContainer);

    var containerInspect = Q.denodeify(function(container, callback) {
        container.inspect(callback);
    });
    var containerStart = Q.denodeify(function(container, callback) {
        container.start(callback);
    });
    var containerRestart = Q.denodeify(function(container, callback) {
        container.restart(callback);
    });

    var getApps = Q.denodeify(function(callback) {
        whaler.apps.all(callback);
    });
    var getDomains = Q.denodeify(function(callback) {
        haproxyDb.find({}, callback);
    });

    var createConfig = function(appName, ip, port, domains) {
        var name = appName + '.whaler.lh_' + ip.replace('.', '_') + '_' + port;
        return {
            name: name,
            domains: [
                appName + '.whaler.lh'
            ].concat(domains || []),
            backends: [
                {
                    name: 'backend_' + name,
                    port: port,
                    ip: ip
                }
            ]
        };
    };

    var touchHaproxy = function(callback) {
        var promise = Q.async(function*() {
            var apps = yield getApps();

            var domains = {};
            var docs = yield getDomains();
            while (docs.length) {
                var doc = docs.shift();
                if (!domains[doc['app']]) {
                    domains[doc['app']] = [];
                }
                domains[doc['app']].push(doc['_id']);
            }

            var opts = {
                apps: [],
                ssl_apps: []
            };

            var keys = Object.keys(apps);
            while (keys.length) {
                var appName = keys.shift();
                var app = apps[appName];
                var names = Object.keys(app.config['data']);

                while (names.length) {
                    var name = names.shift();
                    var config = app.config['data'][name];

                    if (config['web'] || config['ssl']) {
                        var container = whaler.docker.getContainer(name + '.' + appName);
                        try {
                            var info = yield containerInspect(container);
                            if (info['State']['Running']) {
                                var ip = info['NetworkSettings']['IPAddress'];
                                if (config['web'] || null) {
                                    opts['apps'].push(createConfig(appName, ip, config['web'], domains[appName] || []));
                                }
                                if (config['ssl'] || null) {
                                    opts['ssl_apps'].push(createConfig(appName, ip, config['ssl'], domains[appName] || []));
                                }
                            }
                        } catch (e) {}
                    }
                }
            }

            var res = nunjucks.render('haproxy.cfg', opts);
            fs.writeFileSync('/etc/whaler/haproxy.cfg', res);

            var created = false;
            var started = false;

            var container = whaler.docker.getContainer('whaler_haproxy');
            try {
                var info = yield containerInspect(container);
                created = true;
                if (info['State']['Running']) {
                    started = true;
                }
            } catch (e) {}

            if (!created) {
                yield pull('haproxy:1.5');

                var createOpts = {
                    'name': 'whaler_haproxy',
                    'Image': 'haproxy:1.5',
                    'ExposedPorts': {
                        '80/tcp': {},
                        '443/tcp': {}
                    },
                    'HostConfig': {
                        'Binds': [
                            '/etc/whaler/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg'
                        ],
                        PortBindings: {
                            '80/tcp': [
                                {
                                    'HostIp': '',
                                    'HostPort': '80'
                                }
                            ],
                            '443/tcp': [
                                {
                                    'HostIp': '',
                                    'HostPort': '443'
                                }
                            ]
                        }
                    }
                };

                container = yield createContainer(createOpts);
            }

            if (started) {
                yield containerRestart(container);
                console.info('[%s] Haproxy restarted.', process.pid,'\n');

            } else {
                yield containerStart(container);
                console.info('[%s] Haproxy started.', process.pid,'\n');
            }

        })();

        promise.done(function() {
            callback(null);
        }, function(err) {
            callback(err);
        });
    };

    whaler.events.after('haproxy-publish', function(options, callback) {
        touchHaproxy(callback);
    });

    whaler.events.after('haproxy-unpublish', function(options, callback) {
        touchHaproxy(callback);
    });

    whaler.events.after('start', function(options, callback) {
        touchHaproxy(callback);
    });

    whaler.events.after('stop', function(options, callback) {
        touchHaproxy(callback);
    });

    whaler.events.after('remove', function(options, callback) {
        options['ref'] = whaler.helpers.getRef(options['ref']);

        var appName = options['ref'];
        var containerName = null;

        var parts = options['ref'].split('.');
        if (2 == parts.length) {
            appName = parts[1];
            containerName = parts[0];
        }

        if (!containerName && options['purge']) {
            haproxyDb.remove({ app: appName }, { multi: true }, function (err, numRemoved) {
                touchHaproxy(callback);
            });
        } else {
            touchHaproxy(callback);
        }
    });
};
