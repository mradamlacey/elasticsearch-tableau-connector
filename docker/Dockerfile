FROM node:8.9.4-alpine

RUN apk update && \
    apk upgrade && \
    apk add git

RUN npm install -g grunt-cli bower && \
	git config --global url."https://".insteadOf git://

RUN cd /usr/local && \
	git clone --depth=1 --branch=master https://github.com/mradamlacey/elasticsearch-tableau-connector.git && \
	cd elasticsearch-tableau-connector && \
	rm -rf .git && \
	npm install && \
	bower install --allow-root && \
	grunt build:dev

WORKDIR "/usr/local/elasticsearch-tableau-connector"

EXPOSE 3000

CMD ["node", "index.js"]
