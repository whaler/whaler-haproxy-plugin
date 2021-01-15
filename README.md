# Whaler haproxy plugin

This plugin install haproxy as a load balancer for whaler.
Plugin is useful when you need deploy multiple applications on one server, or use complex application publishing.

## Install

```sh
whaler plugins:install whaler-haproxy-plugin
```

## Dnsmasq

The only reason why `dnsmasq` is needed is to point all the domains `*.whaler.lh` to machine where docker is installed.
On `linux` it is `127.0.0.1`, on `windows` and `mac` it's virtual machines's IP.

> **NB!** Dnsmasq step is pure optional, but then you need manually add records to `/etc/hosts` file.

Install dnsmasq:

```sh
sudo apt-get install dnsmasq
```

Update config file `/etc/dnsmasq.conf` with following line:

```
address=/whaler.lh/127.0.0.1
```

> **NB!** Don't forget to replace 127.0.0.1 with virtual machine ip, if not on linux.

### How to avoid conflicts between `dnsmasq` and `systemd-resolved`

Update config file `/etc/dnsmasq.conf` with following lines:

```
server=8.8.8.8
server=8.8.4.4
# ...
```

Run this commands:

```sh
sudo systemctl stop systemd-resolved
sudo systemctl disable systemd-resolved
sudo sed -i 's/\[main\]/\[main\]\ndns=dnsmasq/g' /etc/NetworkManager/NetworkManager.conf
sudo systemctl restart NetworkManager
sudo rm /etc/resolv.conf
sudo ln -s /var/run/NetworkManager/resolv.conf /etc/resolv.conf
sudo systemctl restart dnsmasq
```

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
