'use strict';

var addCmd = function(whaler) {
    var console = whaler.require('./lib/console');

    whaler.cli.command(
        'unpublish <domain> [app]'
    ).argumentsHelp({
        'app': 'Application name',
        'domain': 'Domain to unpublish'
    }).description(
        'Unpublish an application'
    ).action(function(domain, app, options) {

        var opts = {
            app: app,
            domain: domain
        };

        whaler.events.emit('haproxy-unpublish', opts, function(err) {
            console.log('');
            if (err) {
                return console.error('[%s] %s', process.pid, err.message, '\n');
            }

            var app = whaler.helpers.getName(opts['app']);
            console.info('[%s] Domain "%s" unpublished from "%s" app.', process.pid, opts['domain'], app, '\n');
        });

    });
};

module.exports = function(whaler, haproxyDb) {

    addCmd(whaler);

    whaler.events.on('haproxy-unpublish', function(options, callback) {
        options['app'] = whaler.helpers.getName(options['app']);

        whaler.apps.get(options['app'], function(err, app) {
            if (err) {
                return callback(err);
            }

            haproxyDb.remove({ _id: options['domain'] }, {}, function(err, numRemoved) {
                if (err) {
                    return callback(err);
                }
                callback(null);
            });
        });
    });
};
