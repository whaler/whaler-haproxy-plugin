'use strict';

var fs = require('fs');
var nunjucks = require('nunjucks');
var Datastore = require('nedb');
var console = require('x-console');

module.exports = exports;
module.exports.__cmd = require('./cmd');

/**
 * @param whaler
 */
function exports(whaler) {
    const haproxyDb = new Datastore({
        filename: '/var/lib/whaler/plugins/haproxy/db',
        autoload: true
    });

    whaler.on('haproxy:domains', function* (options) {
        const docs = yield haproxyDb.find.$call(haproxyDb, {});
        const response = [];
        for (let doc of docs) {
            if (!options['app'] || options['app'] == doc.app) {
                response.push([doc.app, doc._id]);
            }
        }
        return response;
    });

    whaler.on('haproxy:domains:publish', function* (options) {
        const storage = whaler.get('apps');
        const app = yield storage.get.$call(storage, options['app']);
        yield haproxyDb.insert.$call(haproxyDb, {
            _id: options['domain'],
            app: options['app']
        });
    });

    whaler.on('haproxy:domains:unpublish', function* (options) {
        const storage = whaler.get('apps');
        const app = yield storage.get.$call(storage, options['app']);
        const numRemoved = yield haproxyDb.remove.$call(haproxyDb, { _id: options['domain'] }, {});
    });

    whaler.after('haproxy:domains:publish', function* (options) {
        yield touchHaproxy.$call(null, whaler, haproxyDb);
    });

    whaler.after('haproxy:domains:unpublish', function* (options) {
        yield touchHaproxy.$call(null, whaler, haproxyDb);
    });

    whaler.after('start', function* (options) {
        yield touchHaproxy.$call(null, whaler, haproxyDb);
    });

    whaler.after('stop', function* (options) {
        yield touchHaproxy.$call(null, whaler, haproxyDb);
    });

    whaler.after('remove', function* (options) {
        let appName = options['ref'];
        let serviceName = null;

        const parts = options['ref'].split('.');
        if (2 == parts.length) {
            appName = parts[1];
            serviceName = parts[0];
        }

        if (!serviceName && options['purge']) {
            const numRemoved = yield haproxyDb.remove.$call(haproxyDb, { app: appName }, { multi: true });
        }

        yield touchHaproxy.$call(null, whaler, haproxyDb);
    });
}

// PRIVATE

/**
 * @param appName
 * @param ip
 * @param port
 * @param domains
 * @returns {}
 */
function createConfig(appName, ip, config, domains) {
    const port = config['port'] || config;
    const name = appName + '.whaler.lh_' + ip + '_' + port;

    let defaults = config['defaults'] || null;
    if (defaults) {
        defaults = defaults.replace(/(?:\r\n|\r|\n)/g, '\n        ').trim();
    }

    return {
        name: name,
        domains: [
            appName + '.whaler.lh'
        ].concat(domains || []),
        defaults: defaults,
        send_proxy: (config['send-proxy'] || false),
        backends: [
            {
                name: 'backend_' + name,
                port: port,
                ip: ip
            }
        ]
    };
}

/**
 * @param whaler
 * @param haproxyDb
 */
function* touchHaproxy(whaler, haproxyDb) {
    const docker = whaler.get('docker');
    const storage = whaler.get('apps');
    const apps = yield storage.all.$call(storage);

    const domains = {};
    const docs = yield haproxyDb.find.$call(haproxyDb, {});
    for (let doc of docs) {
        if (!domains[doc['app']]) {
            domains[doc['app']] = [];
        }
        domains[doc['app']].push(doc['_id']);
    }

    const opts = {
        apps: [],
        ssl_apps: []
    };

    for (let appName in apps) {
        const app = apps[appName];

        let services = app.config['data'];
        if (whaler.require('./package.json').version >= '0.3') {
            services = app.config['data']['services'];
        }

        for (let name in services) {
            const config = services[name];
            if (config['web'] || config['ssl']) {
                const container = docker.getContainer(name + '.' + appName);
                try {
                    const info = yield container.inspect.$call(container);
                    if (info['State']['Running']) {
                        const ip = info['NetworkSettings']['IPAddress'];
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

    nunjucks.configure(__dirname + '/templates');
    const res = nunjucks.render('haproxy.cfg', opts);
    yield fs.writeFile.$call(null, '/var/lib/whaler/plugins/haproxy/cfg', res);

    let created = false;
    let started = false;

    let container = docker.getContainer('whaler_haproxy');
    try {
        const info = yield container.inspect.$call(container);
        created = true;
        if (info['State']['Running']) {
            started = true;
        }
    } catch (e) {}

    if (!created) {
        try {
            yield docker.followPull.$call(docker, 'haproxy:1.5');
        } catch(e) {}


        const createOpts = {
            'name': 'whaler_haproxy',
            'Image': 'haproxy:1.5',
            'ExposedPorts': {
                '80/tcp': {},
                '443/tcp': {}
            },
            'HostConfig': {
                'Binds': [
                    '/var/lib/whaler/plugins/haproxy/cfg:/usr/local/etc/haproxy/haproxy.cfg'
                ],
                'PortBindings': {
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
                },
                'RestartPolicy': {
                    'Name': 'always'
                }
            }
        };

        container = yield docker.createContainer.$call(docker, createOpts);
    }

    if (started) {
        yield container.restart.$call(container);
        console.info('');
        console.info('[%s] Haproxy restarted.', process.pid);

    } else {
        yield container.start.$call(container);
        console.info('');
        console.info('[%s] Haproxy started.', process.pid);
    }
}

