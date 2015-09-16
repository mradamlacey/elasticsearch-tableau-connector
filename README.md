# elasticsearch-tableau-connector
Tableau Web Data Connector for Elasticsearch

# Overview

This is an instance of a Tableau Web Data Connector for Elasticsearch.  

# Configuration
- You must enable CORS support in your Elasticsearch server.  Set the following setting in `elasticsearch.yml`:

```yaml
http.cors.enabled = true
```
# Usage

Simply run this web app:

```
node index.js
```

And from Tableau go to 'Web Data Connector' and enter the URL of the connector on your web server:

```
http://<your web server>/elasticsearch-connector.html
```

If you are running this web app locally, and testing from the Tableau Web Data Connector SDK, simply enter:

```
http://localhost:3000/elasticsearch-connector.html
```