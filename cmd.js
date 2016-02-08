'use strict';

var console = require('x-console');
var Table = require('cli-table');

module.exports = cmd;

/**
 * @param whaler
 */
function cmd(whaler) {

    domains(whaler);
    publish(whaler);
    unpublish(whaler);

}

/**
 * @param whaler
 */
function domains(whaler) {

    whaler.get('cli')
        .command('domains [app]')
        .description('Show published domains', {
            app: 'Application name'
        })
        .action(function* (app, options) {
            const response = yield whaler.$emit('haproxy:domains', {
                app: app
            });

            const table = new Table({
                head: [
                    'Application name',
                    'Domain'
                ],
                style : {
                    head: [ 'cyan' ]
                }
            });
            for (let data of response) {
                table.push(data);
            }

            console.log('');
            console.log(table.toString());
        });

}

/**
 * @param whaler
 */
function publish(whaler) {

    whaler.get('cli')
        .command('domains:publish <domain> [app]')
        //.alias('publish')
        .description('Publish app domain', {
            app: 'Application name',
            domain: 'Domain to publish'
        })
        .action(function* (domain, app, options) {
            app = this.util.prepare('name', app);
            yield whaler.$emit('haproxy:domains:publish', {
                app: app,
                domain: domain
            });

            console.info('');
            console.info('[%s] Domain "%s" published to "%s" app.', process.pid, domain, app);
        });

}

/**
 * @param whaler
 */
function unpublish(whaler) {

    whaler.get('cli')
        .command('domains:unpublish <domain> [app]')
        //.alias('unpublish')
        .description('Unpublish app domain', {
            app: 'Application name',
            domain: 'Domain to unpublish'
        })
        .action(function* (domain, app, options) {
            app = this.util.prepare('name', app);
            yield whaler.$emit('haproxy:domains:unpublish', {
                app: app,
                domain: domain
            });

            console.info('');
            console.info('[%s] Domain "%s" unpublished from "%s" app.', process.pid, domain, app);
        });

}
