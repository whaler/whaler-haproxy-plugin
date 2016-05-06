# Whaler haproxy plugin

This plugin install haproxy as a load balancer for whaler.
Plugin is useful when you need deploy multiple applications on one server, or use complex application publishing.

## Install

```sh
$ whaler plugins:install whaler-haproxy-plugin
```

## Dnsmasq

The only reason why `dnsmasq` is needed is to point all the domains `*.whaler.lh` to machine where docker is installed.
On `linux` it is `127.0.0.1`, on `windows` and `mac` it's virtual machines's ip.

```
NB! Dnsmasq step is pure optional, but then you need manually add records to `/etc/hosts` file.
```

Install dnsmasq.

```sh
$ sudo apt-get install dnsmasq
```

Update config file `/etc/dnsmasq.conf` with following line:

```
address=/whaler.lh/127.0.0.1
```

Don't forget to replace 127.0.0.1 with virtual machine ip, if not on linux.


## License

This software is under the MIT license. See the complete license in:

```
LICENSE
```
