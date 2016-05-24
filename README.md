# `elasticsearch-tableau-connector`
Tableau Web Data Connector for Elasticsearch

# Overview

This is an instance of a Tableau Web Data Connector for Elasticsearch.  This will extract a set of data from Elasticsearch
based on the cluster URL, index name, type and optional custom query and create a Tableau extract of the data.  The connector
will query the specified type's mapping in Elasticsearch to report the fields and data types that Tableau
can expect to see.

This connector should be periodically refreshed, as the extract only includes data from the point in time 
that it was executed.

The connector works by retrieving 'pages' of data from Elasticsearch up to either the limit specified, or up to the total
number of hits.  The user can override the batch size to retrieve more records per page if desired.

# Known Issues and Limitations

- Fields with `array` or`object` they will be ignored

# Configuration
- You must enable CORS support in your Elasticsearch server.  Set the following setting in `elasticsearch.yml`:

```yaml
http.cors.enabled: true
```

Additionally, in current versions of Elasticsearch (2.3+), it is required to define which origins
are allowed to send CORS requests (this is defined by the `origin` HTTP request header).  The following configuration in `elasticsearch.yml` will allow _ALL_ origins but is
considered insecure:

```yaml
http.cors.allow-origin: "*"
```

If you use some other front end HTTP proxy in front of your Elasticsearch cluster, you will need to make sure that
CORS requests are allowed, including authorization headers.


For more detailed information on Elasticsearch configuration options refer to:
[Elasticsearch Configuration Reference](https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-http.html)

# Building and Running

## Pre-requisites

Install grunt:
```
npm install -g grunt
```

Install bower:
```
npm install -g bower
```

## Install dependencies

Run the following from the command line:
```
npm install
bower install
```

## Creating distribution suitable for deploying to Tableau Server
From the command line execute:
```
grunt build:dist
```

This will package the connector files in the `dist` folder, combining javascript and CSS into single files.

## Building and running from local development environment

You can build, watch sources for changes, and run the application at the command line with grunt with:
```
grunt
```

This will watch all sub-directories for changes and reload the application if anything changes.  Running this app will
simply host all the connector resources but when requested stand alone will not do anything useful.  You should either
use the connector within the [Web Data Connector SDK](http://community.tableau.com/thread/178867)
test harness, or use the connector from Tableau Desktop or Server.

> Note that internally there are tasks that run the `build:dev` target, to perform HTML templating, and copy all
source files to the `public/` source folder where the NodeJS server will serve static resources from

Make note of the URL that the connector app is running on, e.g.:
```
Elasticsearch Tableau Web Data connector server listening at http://0.0.0.0:3000
```

Simply choose the 'Web Data Connector' as your data source from within Tableau Desktop, or use the Web Connector SDK and enter the URL..

## Running using Docker

A `Dockerfile` is supplied in `docker/Dockerfile` that will build an image that creates a development build of the
latest source from Github, and runs the node server.

You can build an image from the root of the project:

```
docker build docker -t <name of tag>
```

and can then start a container, which will map the server to the host's port 3000 from this image with:

```
docker run <name of tag> -p 3000:3000
```

## Importing into Tableau Server

Execute the build for this project from the command line:

```
grunt build:dist
```

For each file in the `dist/` folder, import into Tableau Server by:

- Ensure the Tableau command line tools are in your PATH
- From a command line (and your working director is the `dist/` folder) execute the following:

```
tabadmin import_webdataconnector elasticsearch-connector.html
tabadmin import_webdataconnector elasticsearch-connector.min.css
tabadmin import_webdataconnector elasticsearch-connector.min.js
```

Get the URL of the `elasticsearch-connector.html` on the Tableau Server by executing:
```
tabadmin list_webdataconnectors --urls
```

And from Tableau go to 'Web Data Connector' and enter the URL of the connector:

![](https://github.com/mradamlacey/elasticsearch-tableau-connector/blob/master/resources/wdc_desktop_use_connector.png)

```
http://<your tableau server>/webdataconnectors/elasticsearch-connector.html
```

## Using with the Web Data Connector SDK
If you are running this web app locally, and testing from the Tableau Web Data Connector SDK, simply enter:

```
http://localhost:3000/elasticsearch-connector.html
```

into the `Web Connector URL` input field in the SDK's form.

From there you should see this connector's UI:
![](https://github.com/mradamlacey/elasticsearch-tableau-connector/blob/master/resources/connector-form-example.png)

## Using the Connector UI

The Elasticsearch connector UI includes the following fields:

| Field Name | Data Type | Description | 
-------------|-----------|-------------|
| Connection Name | String | Name of the data source connection displayed in the Tableau workbook |
| Elasticsearch URL | String | \[Required\] URL of the Elasticsearch cluster |
| Use HTTP Basic authentication | Boolean | \[Required\] Indicates if the Elasticsearch cluster requires HTTP Basic Auth |
| Username | String | If 'Use HTTP Basic Auth' is checked, this is the user name|
| Password | String | If 'Use HTTP Basic Auth' is checked, this is the password |
| Index name | String | \[Required\] Name of the index in the Elasticsearch cluster |
| Type | String | \[Required\] Name of the type in the Elasticsearch cluster to query |
| Use custom query? | Boolean | If true, indicates if the extract should use a custom query against Elasticsearch, if false extract will be a 'match all' |
| Query | String | If `Use custom query?` is true, this will be the JSON request payload sent to Elasticsearch.  `from`, and `size` will be overwritten if supplied. Refer to [Elasticsearch Query DSL](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl.html) for a reference on writing a query |
| Batch size of per request to Elasticsearch | Integer | Number of rows to retrieve at once, defaults to 10, should probably be 1000+ |
| Total limit on numnber of rows to sync | Integer | Limit of rows to include in extract, defaults to 100, but generally should be left blank to indicate that all matching rows should be included |

The 'Submit' button will execute the extract and report the total number of rows and the executing time when completed.

## Handling Elasticsearch Data Types

### `geo_point`

For `geo_point` fields in Elasticsearch, this connector will create two separate Tableau fields by parsing the `lat, lon` value:
- Latitude - field will be named `<field-name>_latitude` - float type
- Longitude - field will be named `<field-name>_longitude` - float type
