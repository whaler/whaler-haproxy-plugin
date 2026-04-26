# Whaler haproxy plugin

This plugin installs `haproxy` as a load balancer for `whaler`.
Plugin is useful when you need deploy multiple applications on one server, or use complex application publishing.

## Install

```sh
whaler plugins:install whaler-haproxy-plugin
```

## Configure

> **NB!** This step is pure optional and only needed to resolve `*.whaler.lh` domains.

add string `127.0.0.1 <app-name>.whaler.lh` to `/etc/hosts` or install [whaler-hosts-plugin](https://github.com/whaler/whaler-hosts-plugin)

## Usage

```yml
services:
    service-name:
        web: 80
        ssl: 443
        ...

# OR

services:
    service-name:
        web:
            port: 80
            defaults: |
                timeout server 50s
        ssl:
            port: 443
            send-proxy: true
        ...
```

## License

This software is under the MIT license. See the complete license in:

```
LICENSE
```
