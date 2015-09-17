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

- At this time there appears that the Tableau framework that executes the connector will only make 6 requests for pages
of data in Elasticsearch, after this a `Maximum Number of Requests Reached` error will be logged
- Fields with `array`, `object`, or `geo_point` data types are not supported, they will be ignored

# Configuration
- You must enable CORS support in your Elasticsearch server.  Set the following setting in `elasticsearch.yml`:

```yaml
http.cors.enabled = true
```

[Elasticsearch Configuration Reference](https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-http.html)

If you use some other front end HTTP proxy in front of your Elasticsearch cluster, you will need to make sure that
CORS requests are allowed, including authorization headers.

# Building and Running

From the command line execute:
```
grunt build
```

This will package the connector files in the `public` folder.

You can run the application at the command line with grunt with:
```
grunt
```

This will watch all sub-directories for changes and reload the application if anything changes.  Running this app will
simpy host all the connector resources but when requested stand alone will not do anything useful.  You should either 
use the connector within the [Web Data Connector SDK](http://community.tableau.com/thread/178867)
test harness, or use the connector from Tableau Desktop or Server.

# Usage

## Using in Tableau Desktop

Run the application, from the command line execute:

```
node index.js
```

or from a development machine, you can run:
```
grunt
```

Make note of the URL that the connector app is running on, e.g.:
```
Elasticsearch Tableau Web Data connector server listening at http://0.0.0.0:3000
```

Simply choose the 'Web Data Connector' as your data source and enter the URL (you might need to enter
the IP address or host name).

From there ent

## Importing into Tableau Server

Execute the build for this project from the command line:

```
grunt build
```

For each file in the `public/` folder, import into Tableau Server by:

- Ensure the Tableau command line tools are in your PATH
- From a command line execute the following:

```
tabadmin import_webdataconnector elasticsearch-connector.html
tabadmin import_webdataconnector bootstrap.css
tabadmin import_webdataconnector bootstrap.js
tabadmin import_webdataconnector elasticsearch.png
// other files...
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
| Index name | String | \[Required\] Name of the index in the Elasticsearch cluster |
| Type | String | \[Required\] Name of the type in the Elasticsearch cluster to query |
| Use custom query? | Boolean | If true, indicates if the extract should use a custom query against Elasticsearch, if false extract will be a 'match all' |
| Query | String | If `Use custom query?` is true, this will be the JSON request payload sent to Elasticsearch.  `from`, and `size` will be overwritten if supplied. Refer to [Elasticsearch Query DSL](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl.html) for a reference on writing a query |
| Batch size of per request to Elasticsearch | Integer | Number of rows to retrieve at once, defaults to 10, should probably be 1000+ |
| Total limit on numnber of rows to sync | Integer | Limit of rows to include in extract, defaults to 100, but generally should be left blank to indicate that all matching rows should be included |

The 'Submit' button will execute the extract and report the total number of rows and the executing time when completed.
