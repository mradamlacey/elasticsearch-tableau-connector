FROM ubuntu:14.04

RUN apt-get update && \
	apt-get install -y \
							curl \
							git

RUN curl -sL https://deb.nodesource.com/setup | bash -

RUN apt-get install -y nodejs

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

CMD ["/usr/bin/nodejs", "index.js"]
