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

# Compatibility

The 2.0 release (in the `release-2.0` branch and current development version in `master`) supports **Tableau 10.0 or later**.

The 1.0 release (in the `release-1.0` branch) supports **Tableau 9.1.6 or later, 9.2.4 or later, and 9.3**.

# Known Issues and Limitations

- Fields with `array` values will have the value from the first element used, otherwise the entire array will be passed as a value (which probably will not display in Tableau
  correctly)
- Extremely large datasets can cause issues and crash Tableau as all available memory is consumed

# Configuration

## Enable `CORS`

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

For more detailed information on Elasticsearch configuration options refer to:
[Elasticsearch Configuration Reference](https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-http.html)

## Enabling `CORS` with a proxy

As an alternative to enabling `CORS` through the Elasticsearch configuration file, you can setup a proxy in front of Elasticsearch that
will set the property HTTP response headers.

As an example, in AWS - here's a link that describes how to setup an API gateway that sends CORS headers: http://enable-cors.org/server_awsapigateway.html

An instance of an API gateway (with CORS enabled) is used that forwards requests to your Elasticsearch instance.

The Elasticsearch URL used in the Tableau connector configuration should be the URL of your API Gateway.

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
## Running as a Windows service

For convenience, the connector comes with [winser](https://github.com/jfromaniello/winser) to install the connector
web server as a Windows service.

To install as a Windows service:

```
npm run-script install-service
```

This will install a service named `elasticsearch-tableau-connector`.  Open the
Windows service manager (`services.msc`) to start the service.

To uninstall the service:

```
npm run-script uninstall-service
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

Connector UI when in Aggregation mode:
![](https://github.com/mradamlacey/elasticsearch-tableau-connector/blob/master/resources/connector-form-aggregation-example.png)

Connector UI after fetching preview data:
![](https://github.com/mradamlacey/elasticsearch-tableau-connector/blob/master/resources/connector-form-preview-example.png)

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
| Result Mode | Option | Option to retrieve search results from Elasticsearch (Search Result Mode) or from a query using aggregation (Aggregation Mode) |
| Use custom query? | Boolean | If true, indicates if the extract should use a custom query against Elasticsearch in search result mode, if false extract will be a 'match all' |
| Query | String | If `Use custom query?` is true, this will be the JSON request payload sent to Elasticsearch in search result mode.  `from`, and `size` will be overwritten if supplied. Refer to [Elasticsearch Query DSL](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl.html) for a reference on writing a query |
| Batch size of per request to Elasticsearch | Integer | Number of rows to retrieve at once, defaults to 10, should probably be 1000+ |
| Total limit on numnber of rows to sync | Integer | Limit of rows to include in extract, defaults to 100, but generally should be left blank to indicate that all matching rows should be included |
| Use custom query? (aggregation mode) | Boolean | If true, indicates the data extract should use a custom query that includes an aggregation request |
| Custom query | String | JSON payload sent in the request for Elasticsearch, must include `aggregations` and `aggs` for Terms, Range, Date Range or Date Histogram |
| Metrics | Metric | One or more metrics to calculate for the aggregation results.  Valid options are Count, Min, Max, Sum, Average, Stats, and Extended Stats. Refer to 'Metrics' section |
| Buckets | Bucket | Bucket to aggregate results to and calculate metrics for, or multiple levels of child buckets.  See buckets for more information |

### Metrics

Supported metrics:

 - Count
 - [Min](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-min-aggregation.html)
 - [Max](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-max-aggregation.html)
 - [Sum](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-sum-aggregation.html)
 - [Average](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-avg-aggregation.html)
 - [Stats](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-stats-aggregation.html)
 - [Extended Stats](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-metrics-extendedstats-aggregation.html)

### Buckets

 - [Terms](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-terms-aggregation.html)
 - [Range](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-range-aggregation.html)
 - [Date Range](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-daterange-aggregation.html)
 - [Date Histogram](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-datehistogram-aggregation.html)

### Preview

The connector supports requesting data for Elasticsearch from the UI to preview the data that will be created in the data extract in Tableau.  The preview button will send this
request to Elasticsearch based on the current configuration and populate a table at the bottom of the view.  This feature is useful for debugging 
to make sure any custom queries and other configuration returns a valid response.

> Note - it is recommended to set a small limit if in 'Search result mode' to limit the amount of data returned

### Submit

The submit button will save the configuration for the data extract with Tableau and continue the process of creating the extract.

## Handling Elasticsearch Data Types

### `object`

For types that include mapping with objects (fields with their set of properties), a concatenated field name will be created.  For the following mapping:
```json
{
    "person": {
        "properties": {
            "firstName": {
                "type": "string"
            },
            "lastName": {
                "type": "string"
            },
            "address": {
                "properties": {
                    "street": {
                        "type": "string"
                    },
                    "city": {
                        "type": "string"
                    },
                    "zip": {
                        "type": "string"
                    }
                }
            }
        }
    }
}
``` 

Will create the following fields:

 - `person.firstName`
 - `person.lastName`
 - `person.address.street`
 - `person.address.city`
 - `person.address.zip`

### `geo_point`

For `geo_point` fields in Elasticsearch, this connector will create two separate Tableau fields by parsing the `lat, lon` value:
- Latitude - field will be named `<field-name>_latitude` - float type
- Longitude - field will be named `<field-name>_longitude` - float type

# Sponsorship

![DialogTech Logo](https://www.dialogtech.com/wp-content/themes/ifbyphone/theme/images/logo-2x.png "DialogTech Logo")

This project has been made in possible in part by support from [DialogTech](http://www.dialogtech.com)