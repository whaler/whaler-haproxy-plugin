'use strict';

var Table = require('cli-table');

var addCmd = function(whaler) {
    var console = whaler.require('./lib/console');

    whaler.cli.command(
        'domains [app]'
    ).description(
        'Show domains'
    ).action(function(app, options) {

        var opts = {
            app: app
        };

        whaler.events.emit('haproxy-domains', opts, function(err, response) {
            console.log('');
            if (err) {
                return console.error('[%s] %s', process.pid, err.message, '\n');
            }

            var table = new Table({
                head: [
                    'Application name',
                    'Domain'
                ],
                style : {
                    head: [ 'cyan' ]
                }
            });
            while (response.length) {
                var data = response.shift();
                table.push(data);
            }
            console.log(table.toString(), '\n');
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

    whaler.events.on('haproxy-domains', function(options, callback) {
        haproxyDb.find({}, function(err, docs) {
            if (err) {
                return callback(err);
            }

            var response = [];
            while (docs.length) {
                var doc = docs.shift();
                if (!options['app'] || options['app'] == doc.app) {
                    response.push([doc.app, doc._id]);
                }
            }

            callback(null, [response]);
        });
    });
};
