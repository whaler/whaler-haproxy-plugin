'use strict';

module.exports = cmd;

/**
 * @param whaler
 */
async function cmd (whaler) {

    await domains(whaler);
    await publish(whaler);
    await unpublish(whaler);

}

/**
 * @param whaler
 */
async function domains (whaler) {

    (await whaler.fetch('cli')).default

        .command('domains [app]')
        .description('Show published domains', {
            app: 'Application name'
        })
        .option('-f, --format <FORMAT>', 'The output format (txt or json) [default: "txt"]')
        .action(async (app, options) => {
            const response = await whaler.emit('haproxy:domains', { app });

            if ('json' == options.format) {
                console.log(JSON.stringify(response, null, 2));
            } else {
                const table = (await whaler.fetch('cli-table')).default({
                    head: [ 'Application name', 'Domain' ]
                });
                console.log('\n' + table.render(response) + '\n');
            }
        })
        .ignoreEndLine(true);
}

/**
 * @param whaler
 */
async function publish (whaler) {

    (await whaler.fetch('cli')).default

        .command('domains:publish <domain> [app]')
        //.alias('publish')
        .description('Publish app domain', {
            app: 'Application name',
            domain: 'Domain to publish'
        })
        .action(async (domain, app, options, util) => {
            app = util.prepare('name', app);
            await whaler.emit('haproxy:domains:publish', { app, domain });
            whaler.info('Domain "%s" published to "%s" app.', domain, app);
        });

}

/**
 * @param whaler
 */
async function unpublish (whaler) {

    (await whaler.fetch('cli')).default

        .command('domains:unpublish <domain>')
        //.alias('unpublish')
        .description('Unpublish app domain', {
            domain: 'Domain to unpublish'
        })
        .action(async (domain, options) => {
            const app = await whaler.emit('haproxy:domains:unpublish', { domain });
            whaler.info('Domain "%s" unpublished from "%s" app.', domain, app);
        });

}
