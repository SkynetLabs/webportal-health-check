FROM node:18.10.0-alpine

RUN apk add --no-cache git~=2 dnsmasq~=2

WORKDIR /usr/app

ENV PATH="/usr/app/bin:${PATH}"

# schedule critical checks to run every 5 minutes (any failures will disable server)
# schedule extended checks to run on every hour (optional checks, report only)
RUN echo '*/5 * * * * source /etc/environment ; /usr/app/bin/cli run critical >> /proc/1/fd/1' >> /etc/crontabs/root && \
    echo '0 * * * * source /etc/environment ; /usr/app/bin/cli run extended >> /proc/1/fd/1' >> /etc/crontabs/root

COPY package.json \
     yarn.lock \
     ./

RUN yarn --frozen-lockfile

COPY src src
COPY cli cli
COPY bin bin

EXPOSE 3100
ENV NODE_ENV production

# 1. get public server ip and save it in /etc/environment (passed to cron tasks as env variable)
# 2. start dnsmasq in the background with:
#    - alias PORTAL_DOMAIN with current server ip so it overrides potential load balancer request
#    - default docker nameserver 127.0.0.11 for any other request
# 3. replace docker nameserver with dnsmasq nameserver in /etc/resolv.conf
# 4. start crond in the background to schedule periodic health checks
# 5. start the health-check api service
CMD [ "sh", "-c", \
      "export serverip=$(node src/whatismyip.js) && \
       echo \"export serverip=${serverip}\" >> /etc/environment && \
       dnsmasq --no-resolv --log-facility=/var/log/dnsmasq.log --address=/$PORTAL_DOMAIN/$serverip --server=127.0.0.11 && \
       echo \"$(sed 's/127.0.0.11/127.0.0.1/' /etc/resolv.conf)\" > /etc/resolv.conf && \
       crond && \
       node src/index.js" \
    ]
