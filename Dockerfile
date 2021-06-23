FROM node:16.1.0-alpine

RUN apk update && apk add dnsmasq

WORKDIR /usr/app

# schedule critical checks to run every 5 minutes (any failures will disable server)
RUN echo '*/5 * * * * /usr/app/cli/run critical > /dev/stdout' >> /etc/crontabs/root

# schedule extended checks to run on every hour (optional checks, report only)
RUN echo '0 * * * * /usr/app/cli/run extended > /dev/stdout' >> /etc/crontabs/root

COPY package.json .
RUN yarn --no-lockfile
COPY src src
COPY cli cli

EXPOSE 3100
ENV NODE_ENV production

# 1. prepend dnsmasq nameserver so it tries to resolve first
# 2. start dnsmasq in the background and alias siasky.net with current server ip to ommit load balancer
# 3. start crond in the background
# 4. start the health-check api service
CMD [ "sh", "-c", \
      "dnsmasq --no-resolv --log-facility=/var/log/dnsmasq.log --address=/siasky.net/$(node src/whatismyip.js) --server=127.0.0.11 ; \
       echo \"$(sed 's/127.0.0.11/127.0.0.1/' /etc/resolv.conf)\" > /etc/resolv.conf ; \
       crond ; \
       node --max-http-header-size=64000 src/index.js" \
    ]
