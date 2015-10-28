'use strict';

var addCmd = function(whaler) {
    var console = whaler.require('./lib/console');

    whaler.cli.command(
        'publish <domain> [app]'
    ).description(
        'Publish an application'
    ).action(function(domain, app, options) {

        var opts = {
            app: app,
            domain: domain
        };

        whaler.events.emit('haproxy-publish', opts, function(err) {
            if (err) {
                return console.error('[%s] %s', process.pid, err.message, '\n');
            }

            var app = whaler.helpers.getName(opts['app']);
            console.info('[%s] Domain "%s" published to "%s" app.', process.pid, opts['domain'], app, '\n');
        });

    }).on('--help', function() {
        whaler.cli.argumentsHelp(this, {
            'app': 'Application name',
            'domain': 'Domain to publish'
        });
    });
};

module.exports = function(whaler, haproxyDb) {

    addCmd(whaler);

    whaler.events.on('haproxy-publish', function(options, callback) {
        options['app'] = whaler.helpers.getName(options['app']);

        whaler.apps.get(options['app'], function(err, app) {
            if (err) {
                return callback(err);
            }

            var data = {
                _id: options['domain'],
                app: options['app']
            };

            haproxyDb.insert(data, function(err, doc) {
                if (err) {
                    return callback(err);
                }
                callback(null);
            });
        });
    });
};
