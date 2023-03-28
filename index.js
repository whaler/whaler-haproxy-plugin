'use strict';

const fs = require('fs').promises;
const nunjucks = require('nunjucks');

module.exports = exports;
module.exports.__cmd = require('./cmd');

/**
 * @param whaler
 */
async function exports (whaler) {
    if (!whaler.version) {
        throw new Error('unsupported version of `whaler` installed, require `whaler@>=0.7`');
    }

    const { default: storage } = await whaler.fetch('storage');
    const createHaproxyStorage = () => storage.create('haproxy');

    whaler.on('haproxy:domains', async ctx => {
        const haproxyStorage = createHaproxyStorage();
        const data = await haproxyStorage.all();
        const response = [];
        for (let domain in data) {
            if (!ctx.options['app'] || ctx.options['app'] == data[domain]['app']) {
                response.push([data[domain]['app'], domain, data[domain]['regex'] || false]);
            }
        }
        ctx.result = response;
    });

    whaler.on('haproxy:domains:publish', async ctx => {
        const { default: storage } = await whaler.fetch('apps');
        const app = await storage.get(ctx.options['app']);
        const haproxyStorage = createHaproxyStorage();
        await haproxyStorage.insert(ctx.options['domain'], {
            app: ctx.options['app'],
            regex: ctx.options['regex'] || false
        });
    });

    whaler.on('haproxy:domains:unpublish', async ctx => {
        try {
            const haproxyStorage = createHaproxyStorage();
            const data = await haproxyStorage.get(ctx.options['domain']);
            await haproxyStorage.remove(ctx.options['domain']);
            ctx.result = data['app'];
        } catch (e) {
            throw new Error(util.format('Domain `%s` not found.', ctx.options['domain']));
        }
    });

    whaler.after('haproxy:domains:publish', async ctx => {
        await touchHaproxy();
    });

    whaler.after('haproxy:domains:unpublish', async ctx => {
        await touchHaproxy();
    });

    whaler.after('start', async ctx => {
        await touchHaproxy();
    });

    whaler.after('stop', async ctx => {
        await touchHaproxy();
    });

    whaler.after('remove', async ctx => {
        let appName = ctx.options['ref'];
        let serviceName = null;

        const parts = ctx.options['ref'].split('.');
        if (2 == parts.length) {
            appName = parts[1];
            serviceName = parts[0];
        }

        if (!serviceName && ctx.options['purge']) {
            const haproxyStorage = createHaproxyStorage();
            const data = await haproxyStorage.all();
            for (let domain in data) {
                if (appName == data[domain]['app']) {
                    await haproxyStorage.remove(domain);
                }
            }
        }

        await touchHaproxy();
    });

    // PRIVATE

    const touchHaproxy = async () => {
        const { default: docker } = await whaler.fetch('docker');
        const { default: storage } = await whaler.fetch('apps');
        const apps = await storage.all();

        const domains = {};
        const haproxyStorage = createHaproxyStorage();
        const data = await haproxyStorage.all();
        for (let domain in data) {
            if (!domains[data[domain]['app']]) {
                domains[data[domain]['app']] = [];
            }
            domains[data[domain]['app']].push({
                name: domain,
                regex: data[domain]['regex'] || false
            });
        }

        const useDNS = 'OFF' != process.env.WHALER_HAPROXY_PLUGIN_DNS;

        const opts = {
            apps: [],
            ssl_apps: [],
            defaults: {
                timeout: {
                    connect: process.env.WHALER_HAPROXY_PLUGIN_DEFAULTS_TIMEOUT_CONNECT || '5s',
                    client: process.env.WHALER_HAPROXY_PLUGIN_DEFAULTS_TIMEOUT_CLIENT || '50s',
                    server: process.env.WHALER_HAPROXY_PLUGIN_DEFAULTS_TIMEOUT_SERVER || '50s'
                }
            },
            dns: useDNS && {
                tcp: {
                    addr: process.env.WHALER_HAPROXY_PLUGIN_DNS_TCP_ADDR || '127.0.0.11',
                    port: process.env.WHALER_HAPROXY_PLUGIN_DNS_TCP_PORT || '53'
                }
            }
        };

        let whalerNetwork;
        if (useDNS) {
            whalerNetwork = docker.getNetwork('whaler_nw');
            try {
                await whalerNetwork.inspect();
            } catch (e) {
                whalerNetwork = undefined;
            }
        }

        for (let appName in apps) {
            const app = apps[appName];

            const services = app.config['data']['services'];
            for (let name in services) {
                const config = services[name];
                if (config['web'] || config['ssl']) {
                    let ip;
                    if (whalerNetwork) {
                        ip = name + '.' + appName;
                    } else {
                        const container = docker.getContainer(name + '.' + appName);
                        try {
                            const info = await container.inspect();
                            if (info['State']['Running']) {
                                ip = info['NetworkSettings']['IPAddress'];
                            }
                        } catch (e) {}
                    }

                    if (ip) {
                        if (config['web'] || null) {
                            opts['apps'].push(createConfig(appName, ip, config['web'], domains[appName] || [], 'web'));
                        }
                        if (config['ssl'] || null) {
                            opts['ssl_apps'].push(createConfig(appName, ip, config['ssl'], domains[appName] || [], 'ssl'));
                        }
                    }
                }
            }
        }

        let created = false;
        let started = false;

        const haproxyVersion = process.env.WHALER_HAPROXY_PLUGIN_IMAGE_TAG || '2.2';

        let container = docker.getContainer('whaler_haproxy');
        try {
            const info = await container.inspect();
            created = true;
            if (info['State']['Running']) {
                started = true;
            }

            if (created && 'haproxy:' + haproxyVersion !== info['Config']['Image']) {
                await container.remove({
                    v: true,
                    force: true
                });
            }
        } catch (e) {}

        nunjucks.configure(__dirname + '/templates');
        const res = nunjucks.render('haproxy.cfg', opts);
        const pluginDir = '/var/lib/whaler/plugins/haproxy';
        const cfgFile = pluginDir + '/cfg';

        if (created && started) {
            try {
                const prevRes = await fs.readFile(cfgFile, 'utf8');
                if (prevRes == res) {
                    return;
                }
            } catch (e) {}
        }

        await fs.mkdir(pluginDir, { recursive: true });
        await fs.writeFile(cfgFile, res);

        if (!created) {
            try {
                await docker.followPull('haproxy:' + haproxyVersion);
            } catch(e) {}

            const createOpts = {
                'name': 'whaler_haproxy',
                'Image': 'haproxy:' + haproxyVersion,
                'ExposedPorts': {
                    '80/tcp': {},
                    '443/tcp': {}
                },
                'HostConfig': {
                    'Binds': [
                        cfgFile + ':/usr/local/etc/haproxy/haproxy.cfg'
                    ],
                    'PortBindings': {
                        '80/tcp': [
                            {
                                'HostIp': '',
                                'HostPort': process.env.WHALER_HAPROXY_PLUGIN_WEB_PORT || '80'
                            }
                        ],
                        '443/tcp': [
                            {
                                'HostIp': '',
                                'HostPort': process.env.WHALER_HAPROXY_PLUGIN_SSL_PORT || '443'
                            }
                        ]
                    },
                    'RestartPolicy': {
                        'Name': 'always'
                    }
                }
            };

            container = await docker.createContainer(createOpts);
        }

        if (whalerNetwork) {
            try {
                await whalerNetwork.connect({
                    'Container': container.id
                });
            } catch(e) {}
        }

        if (started) {
            //await container.restart();
            await container.kill({ signal: 'HUP' });
            whaler.info('Haproxy restarted.');

        } else {
            await container.start();
            whaler.info('Haproxy started.');
        }
    }
}

// PRIVATE

function createConfig (appName, ip, config, domains, type) {
    const domain = process.env.WHALER_HAPROXY_PLUGIN_DOMAIN || 'whaler.lh';

    const port = config['port'] || ('object' == typeof config ? null : config);
    const name = appName + '.' + domain + '_' + ip + '_' + (port || type);

    let defaults = config['defaults'] || null;
    if (defaults) {
        defaults = defaults.replace(/(?:\r\n|\r|\n)/g, '\n        ').trim();
    }

    return {
        name: name,
        domains: [
            {
                name: appName + '.' + domain,
                regex: false
            }
        ].concat(domains || []),
        send_proxy: (config['send-proxy'] || false),
        backend: {
            defaults: defaults,
            name: 'backend_' + name,
            port: port,
            ip: ip
        }
    };
}
