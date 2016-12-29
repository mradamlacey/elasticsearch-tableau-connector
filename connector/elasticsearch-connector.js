var elasticsearchConnector = (function () {

    var elasticsearchTableauDataTypeMap = {
        string:  tableau.dataTypeEnum.string,
        float:  tableau.dataTypeEnum.float,
        long:  tableau.dataTypeEnum.int,
        integer:  tableau.dataTypeEnum.int,
        double:  tableau.dataTypeEnum.float,
        date:  tableau.dataTypeEnum.datetime,
        boolean:  tableau.dataTypeEnum.bool,
        geo_point:  tableau.dataTypeEnum.string
    },
        elasticsearchFields = [],
        elasticsearchFieldsMap = {},
        elasticsearchAggsMap = {},
        elasticsearchDateFields = [],
        elasticsearchGeoPointFields = [],
        elasticsearchIndices = [],
        elasticsearchTypes = [],
        startTime,
        endTime,
        queryEditor,
        aggQueryEditor;

    var addElasticsearchField = function (name, esType, format, hasLatLon) {

        if (_.isUndefined(elasticsearchTableauDataTypeMap[esType])) {
            console.log("Unsupported Elasticsearch type: " + esType + " for field: " + name);
            return;
        }

        elasticsearchFields.push({ name: name, dataType: elasticsearchTableauDataTypeMap[esType] });
        elasticsearchFieldsMap[name] = { type: elasticsearchTableauDataTypeMap[esType], format: format };

        if (esType == 'date') {
            elasticsearchDateFields.push(name);
        }

        if (esType == 'geo_point') {
            elasticsearchGeoPointFields.push({ name: name, hasLatLon: hasLatLon });
            addElasticsearchField(name + '_latitude', 'float');
            addElasticsearchField(name + '_longitude', 'float');
        }
    }

    var getElasticsearchTypeMapping = function (connectionData, cb) {

        console.log('[getElasticsearchTypeMapping] invoking...');

        if(!connectionData.elasticsearchUrl){
            return abort("Must provide valid Elasticsearch URL");
        }
        if(!connectionData.elasticsearchIndex){
            return abort("Must provide valid Elasticsearch Index");
        }
        if(!connectionData.elasticsearchType){
            return abort("Must provide valid Type");
        }

        $.ajax(connectionData.elasticsearchUrl + '/' + connectionData.elasticsearchIndex + '/' +
            connectionData.elasticsearchType + '/_mapping', {
                context: connectionData,
                dataType: 'json',
                beforeSend: function (xhr) {
                    beforeSendAddAuthHeader(xhr, connectionData);
                },
                success: function (data) {

                    var connectionData = this;
                    console.log('[getElasticsearchTypeMapping] ', connectionData);

                    var indexName = connectionData.elasticsearchIndex;

                    if (cb) {
                        cb(null, data, connectionData);
                    }


                },
                error: function (xhr, ajaxOptions, err) {
                    var err;
                    if (xhr.status == 0) {
                        err = 'Unable to get Elasticsearch types, unable to connect to host or CORS request was denied';
                    }
                    else {
                        err = 'Unable to get Elasticsearch types, status code: ' + xhr.status + '; ' + xhr.responseText + '\n' + err;
                    }

                    console.error(err);

                    if (cb) {
                        cb(err);
                    }

                }
            });
    }
    

    function abort(errorMessage, kill) {

        toastr.error(errorMessage);

        console.error(errorMessage);
        if (kill) {
            console.error('[ElasticsearchConnector] - calling tableau abort');
            tableau.abortWithError(errorMessage);
        }

    }

    //
    // Connector definition
    // 

    var myConnector = tableau.makeConnector();

    myConnector.getSchema = function (schemaCallback) {

        var connectionData;

        try {
            connectionData = JSON.parse(tableau.connectionData);
        }
        catch (ex) {
            abort("Error parsing tableau connection data: \n" + ex, true);
            return;
        }

        console.log('[connector:getSchema] column names: ' + _.pluck(connectionData.fields, 'name').join(', '));

        var cols = _.map(connectionData.fields, function(field){
            return {
                id: field.name,
                dataType: field.dataType
            };
        });

        var tableInfo = {
            id : connectionData.connectionName || "default",
            columns : cols
        };

        schemaCallback([tableInfo]);
    };

    var totalCount = 0,
        searchHitsTotal = -1;

    myConnector.getData = function (table, doneCallback) {

        var lastRecordToken = table.incrementValue || null;

        console.log('[connector:getData] lastRecordToken: ' + lastRecordToken);
        var connectionData = JSON.parse(tableau.connectionData);

        if (connectionData.elasticsearchAuthenticate) {
            var creds = getAuthCredentials(connectionData);

            console.log('[connector:getData] Using HTTP Basic Auth, username: ' +
                creds.username + ', password: ' + creds.password.replace(/./gm, "*"));
        }

        if (connectionData.elasticsearchResultMode == "search") {

            getSearchResponse(true, table, doneCallback, function(err, result){
                console.log("[connector:getData] Finished retrieving search response");
                doneCallback();
            });
        }

        if (connectionData.elasticsearchResultMode == "aggregation") {

            console.log('[connector:getData] getting aggregation response');

            getAggregationResponse(true, table, function(err, data){
                console.log("[connector:getData] Finished retrieving aggregation response");

                if(err){
                    abort(err, true);
                }
                
            });
        }

    };

    myConnector.init = function (cb) {

        console.log('[connector.init] fired');

        if (tableau.phase == tableau.phaseEnum.interactivePhase) {
            $('.no-tableau').css('display', 'none');
            $('.tableau').css('display', 'block');

            initUIControls();
        }

        cb();
    }

    myConnector.shutdown = function (shutdownCallback) {
        endTime = moment();
        var runTime = endTime.diff(startTime) / 1000;
        $('#myPleaseWait').modal('hide');

        $('#divError').css('display', 'none');
        $('#divMessage').css('display', 'block');
        $('#messageText').text(totalCount + ' total rows retrieved, in: ' + runTime + ' (s)');

        $('html, body').animate({
            scrollTop: $("#divMessage").offset().top
        }, 500);

        console.log('[connector:shutdown] callback...');
        shutdownCallback();
    };

    tableau.registerConnector(myConnector);

    //
    // Setup connector UI
    //

    $(document).ready(function () {

        console.log('[$.document.ready] fired...');
    });

    var initUIControls = function () {

        // Initialize Bootstrap popovers

        $('#iconUseSyncClientWorkaround').popover({
            container: "body",
            trigger: "hover"
        });

        $('#iconInfoAggregationFilter').popover({
            container: "body",
            trigger: "hover" ,
            html: true,
            delay: { hide: 2500 },
            placement: "left",
            content: "Use Query String syntax to define a filter to apply to the data that is aggregated.  Refer to: <a href='https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-query-string-query.html#query-string-syntax' target='_blank'>Query String Syntax</a>"           
        });

        $("#submitButton").click(function (e) { // This event fires when a button is clicked            
            console.log("[Elasticsearch Connector] - Submit - noop")
        });

    };

    var getElasticsearchConnectionFieldInfo = function (connectionData, cb) {

        elasticsearchFields = [];
        elasticsearchFieldsMap = {};
        elasticsearchAggsMap = {};
        elasticsearchDateFields = [];
        elasticsearchGeoPointFields = [];

        switch (connectionData.elasticsearchResultMode) {
            case "search":
                // Retrieve the Elasticsearch mapping before we call tableau submit
                // There is a bug when getColumnHeaders is invoked, and you call 'headersCallback'
                // asynchronously
                getElasticsearchTypeMapping(connectionData, function (err, data, connectionData) {

                    if (err) {
                        if(cb) cb(err);
                        return abort(err);
                    }

                    var addChildFields = function (name, objType) {
                        var objProperties = objType.properties ? objType.properties : null,
                            propertyPrefix = name + ".";

                        if (!objProperties) {
                            return;
                        }

                        _.forIn(objProperties, function (val, key) {
                            addElasticsearchField(propertyPrefix + key, val.type, val.format, val.lat_lon);
                            addChildFields(propertyPrefix + key, val);
                        });

                    };

                    var indexName = connectionData.elasticsearchIndex;

                    // Then we selected an alias... choose the last index with a matching type name
                    // TODO: Let user choose which type from which index
                    if (data[connectionData.elasticsearchIndex] == null) {
                        _.forIn(data, function (index, indexKey) {
                            if (index.mappings[connectionData.elasticsearchType]) {
                                indexName = indexKey;
                            }
                        });
                    }

                    var errMsg = null;
                    if (data[indexName] == null) {
                        errMsg = "No mapping found for type: " + connectionData.elasticsearchType + " in index: " + indexName;
                    }
                    if (data[indexName] && data[indexName].mappings == null) {
                        errMsg = "No mapping found for index: " + indexName;
                    }
                    if (data[indexName] && data[indexName].mappings[connectionData.elasticsearchType] == null) {
                        errMsg = "No mapping properties found for type: " + connectionData.elasticsearchType + " in index: " + indexName;
                    }

                    if(errMsg){
                        if(cb) cb(errMsg);
                        return abort(errMsg);
                    }

                    addElasticsearchField('_id', 'string');
                    addElasticsearchField('_sequence', 'integer');

                    _.forIn(data[indexName].mappings[connectionData.elasticsearchType].properties, function (val, key) {
                        // TODO: Need to support nested objects and arrays in some way
                        if(val.properties && val.type != 'nested'){
                            addChildFields(key, val);
                        }
                        else if(val.properties && val.type == 'nested'){
                            console.log("[getElasticsearchConnectionFieldInfo] - Nested field \'" + key + "\' unsupported - ignored");
                        }
                        else{
                            addElasticsearchField(key, val.type, val.format, val.lat_lon);
                        }
                        
                    });

                    console.log('[getElasticsearchConnectionFieldInfo] Number of header columns: ' + elasticsearchFields.length);

                    var fieldData = {
                        elasticsearchAggQuery: aggQueryEditor ? aggQueryEditor.getValue() : null,
                        fields: elasticsearchFields,
                        fieldsMap: elasticsearchFieldsMap,
                        aggFieldsMap: elasticsearchAggsMap,
                        dateFields: elasticsearchDateFields,
                        geoPointFields: elasticsearchGeoPointFields
                    };

                    if (cb) cb(null, fieldData);

                });
                break;

            case "aggregation":

                var aggsQuery;

                // If not using a custom query - build the request payload based on what
                // the user has configured
                if (_.isEmpty(connectionData.elasticsearchAggregationData.customQuery)) {

                    aggsQuery = buildAggregationRequest(connectionData.elasticsearchAggregationData);
                }
                else {
                    try {
                        aggsQuery = JSON.parse(connectionData.elasticsearchAggregationData.customQuery);
                    }
                    catch (err) {
                        if(cb) cb(err);
                        return abort("Error parsing aggregation query, error: " + err);
                    }
                }

                var aggregations = aggsQuery.aggregations ? aggsQuery.aggregations : aggsQuery.aggs;
                if (!aggregations) {
                    var err = "Aggregation query must include 'aggregations' or 'aggs' property";
                    if(cb) cb(err);
                    return abort(err);
                }

                var bucketAggs = parseAggregations(aggregations, "buckets");

                var metricAggs = parseAggregations(aggregations, "metrics");
                // TODO: Add validation that checks if we found metrics at any other level besides the deepest

                _.each(bucketAggs, function (bucketAgg) {
                    addElasticsearchField(bucketAgg.name, bucketAgg.type, bucketAgg.format, null)
                });
                _.each(metricAggs, function (metricAgg) {
                    addElasticsearchField(metricAgg.name, metricAgg.type, metricAgg.format, null)
                });

                console.log('[getElasticsearchConnectionFieldInfo] Number of header columns: ' + elasticsearchFields.length);

                var fieldData = {
                    elasticsearchAggQuery: aggsQuery,
                    fields: elasticsearchFields,
                    fieldsMap: elasticsearchFieldsMap,
                    aggFieldsMap: elasticsearchAggsMap,
                    dateFields: elasticsearchDateFields,
                    geoPointFields: elasticsearchGeoPointFields
                };

                if (cb) cb(null, fieldData);

                break;
        }

    }

    var buildAggregationRequest = function(data){

        var aggsQuery = {
            query: {}
        };

        // Apply global filter using query_string (uses Lucene syntax)
        if(data.filter){
            aggsQuery.query.query_string = { query: data.filter };
        }
        else{
            aggsQuery.query.match_all = {};
        }

        var metricTypeMap = {
            "Min": "min",
            "Max": "max",
            "Average": "avg",
            "Sum": "sum",
            "Stats" : "stats",
            "Extended Stats": "extended_stats"
        };

        aggsQuery.aggregations = {};

        var bucketTypeMap = {
            "Date Range": "date_range",
            "Date Histogram": "date_histogram",
            "Range": "range",
            "Terms": "terms"
        };

        var dateIntervalMap = {
            "Every Second": "1s",
            "Every Minute": "1m",
            "Hourly": "1h", 
            "Daily": "1d", 
            "Weekly": "1w", 
            "Monthly": "1M", 
            "Yearly": "1y"
        };

        var relativeRangeMap = {};

        var currentAg = aggsQuery.aggregations,
            lastAg = null,
            bucketName = null;
        var bucketNum = 0;
        _.each(data.buckets, function(bucket){

            bucketName = 'bucket_' + bucketNum;
            currentAg[bucketName] = {};

            if(bucket.type == "Terms"){
                currentAg[bucketName][bucketTypeMap[bucket.type]] = {
                    field: bucket.field,
                    size: bucket.termSize
                };
            }
            if(bucket.type == "Date Range"){

                currentAg[bucketName][bucketTypeMap[bucket.type]] = {
                    field: bucket.field,
                    ranges: _.map(bucket.dateRanges, function(range){
                        var rangeObj = {},
                            from = range.from,
                            to = range.to;

                        if(!_.isEmpty(from)) rangeObj.from = from;
                        if(!_.isEmpty(to)) rangeObj.to = to;

                        return rangeObj;
                    })
                };
            }
            if(bucket.type == "Date Histogram"){

                var interval = bucket.dateHistogramType == "Custom" ? bucket.dateHistogramCustomInterval : dateIntervalMap[bucket.dateHistogramType];

                currentAg[bucketName][bucketTypeMap[bucket.type]] = {
                    field: bucket.field,
                    interval: interval
                };

            }
            if(bucket.type == "Range"){
                currentAg[bucketName][bucketTypeMap[bucket.type]] = {
                    field: bucket.field,
                    ranges: _.map(bucket.ranges, function(range){
                        var rangeObj = {},
                            from = parseInt(range.from),
                            to = parseInt(range.to);

                        if(!isNaN(from)) rangeObj.from = from;
                        if(!isNaN(to)) rangeObj.to = to;

                        return rangeObj;
                    })
                };
            }
 
            bucketNum++;
            currentAg[bucketName].aggregations = {};
            lastAg = currentAg;
            currentAg = currentAg[bucketName].aggregations;

        });

        var metricNum = 0;

        if(data.metrics.length == 0){
            // If no metrics - then delete the child aggregations element - not used
            delete lastAg[bucketName].aggregations;
        }
        else if(data.metrics.length == 1 && data.metrics[0].type == "Count"){
            // Don't need to add any aggregation for a count of the leaf buckets - we get this for free
            delete lastAg[bucketName].aggregations;
        }
        else{
            _.each(data.metrics, function(metric){

                // Skip Count metrics - we get these for free
                if(metric.type == "Count"){
                    return;
                }

                var metricName = 'metric_' + metricNum;
                currentAg[metricName] = {};

                currentAg[metricName][metricTypeMap[metric.type]] = {
                    field: metric.field
                };

                metricNum++;
            });
        }

        return aggsQuery;
    };

    var getSearchResponse = function (tableauDataMode, table, cb) {
        console.log('[getSearchResponse]...');

        openSearchScrollWindow(tableauDataMode, table, function (err, result) {
            if (err) {
                abort(err, true);
            }
            console.log('[getSearchResponse] opened scroll window, scroll id: ' + result.scrollId);

            getRemainingScrollResults(tableauDataMode, table, result.scrollId, function (err, scrollResult) {
                if (err) {
                    abort(err, true);
                    if(cb){
                        cb(err, null);
                    }
                }
                console.log('[getSearchResponse] processed remaining scroll results, count: ' + scrollResult.results.length);
                console.log("[getSearchResponse] appending initial scroll windows results (" + result.numProcessed + ")");

                scrollResult.numProcessed += result.numProcessed;
                if(!tableauDataMode){
                    scrollResult.results = scrollResult.results.concat(result.results);
                }
                if(cb){
                    cb(null, scrollResult);
                }
            });

        });
    };

    var openSearchScrollWindow = function (tableauDataMode, table, cb) {

        totalCount = 0;
        searchHitsTotal = -1;

        var connectionData = JSON.parse(tableau.connectionData);

        if (!connectionData.elasticsearchUrl) {
            return;
        }

        var requestData = {};

        var strippedQuery = $.trim(connectionData.elasticsearchQuery);
        if (strippedQuery) {
            try {
                requestData = JSON.parse(connectionData.elasticsearchQuery);
            }
            catch (err) {
                abort("Error parsing custom query: " + connectionData.elasticsearchQuery + "\nError:" + err);
                if(cb) cb(err);
                return;
            }
        }
        else {
            requestData = {
                query: { match_all: {} }
            };
        }

        requestData.size = connectionData.batchSize;

        var connectionUrl = connectionData.elasticsearchUrl + '/' + connectionData.elasticsearchIndex + '/' +
            connectionData.elasticsearchType + '/_search?scroll=5m';

        var xhr = $.ajax({
            url: connectionUrl,
            method: 'POST',
            processData: false,
            data: JSON.stringify(requestData),
            dataType: 'json',
            beforeSend: function (xhr) {
                beforeSendAddAuthHeader(xhr, connectionData);
            },
            success: function (data) {

                var result = processSearchResults(tableauDataMode, table, data);

                if(cb){
                    cb(null, result);
                }
            },
            error: function (xhr, ajaxOptions, err) {
                if (xhr.status == 0) {
                    cb('Error creating Elasticsearch scroll window, unable to connect to host or CORS request was denied', true);
                }
                else {
                    cb("Error creating Elasticsearch scroll window, status code:  " + xhr.status + '; ' + xhr.responseText + "\n" + err, true);
                }
            }
        });
    };

    var getRemainingScrollResults = function (tableauDataMode, table, scrollId, cb) {
        var connectionData = JSON.parse(tableau.connectionData);

        if (!connectionData.elasticsearchUrl) {
            if(cb) cb("Elasticsearch URL is required");
            return;
        }

        var connectionUrl = connectionData.elasticsearchUrl + '/_search/scroll';

        var requestData = {
            scroll: '5m',
            scroll_id: scrollId
        };

        var xhr = $.ajax({
            url: connectionUrl,
            method: 'POST',
            processData: false,
            data: JSON.stringify(requestData),
            dataType: 'json',
            beforeSend: function (xhr) {
                beforeSendAddAuthHeader(xhr, connectionData);
            },
            success: function (data) {
                var result = processSearchResults(tableauDataMode, table, data);

                if (result.more) {
                    getRemainingScrollResults(tableauDataMode, table, result.scrollId, function (err, innerResult) {

                        console.log("[getRemainingScrollResults] In callback of handling more results, adding " + innerResult.numProcessed + " to running total of: " + result.numProcessed);
                        innerResult.numProcessed += result.numProcessed;
                        // If collecting results for preview mode (and not Tableau data gather mode) - store the entire retrieved result set
                        if(!tableauDataMode){
                            innerResult.results = innerResult.results.concat(result.results);
                        }
                        
                        if (cb) {
                            cb(null, innerResult);
                        }

                    });
                }
                else{
                    console.log("[getRemainingScrollResults] No more search results to request and processed, done")
                    if (cb) {
                        cb(null, result);
                    }
                }


            },
            error: function (xhr, ajaxOptions, err) {
                if (xhr.status == 0) {
                    cb('Error processing next scroll result, unable to connect to host or CORS request was denied', true);
                }
                else {
                    cb("Error processing next scroll result, status code:  " + xhr.status + '; ' + xhr.responseText + "\n" + err, true);
                }
            }
        });
    };

    var processSearchResults = function (tableauDataMode, table, data) {

        var connectionData = JSON.parse(tableau.connectionData);
        searchHitsTotal = data.hits.total;

        console.log('[processSearchResults] total search hits: ' + searchHitsTotal);

        if (data.hits.hits) {
            var hits = data.hits.hits;
            var ii;
            var toRet = [];

            var hitsToProcess = hits.length;
            if (connectionData.limit && (totalCount + hits.length > connectionData.limit)) {
                hitsToProcess = connectionData.limit - totalCount;
            }

            var assignFieldValue = function (currentRow, name, obj) {
                var objKeys = _.keys(obj),
                    propertyPrefix = name + ".";

                currentRow[name] = _.isNull(obj) || _.isUndefined(obj) ?
                    null :
                    obj;

                if (_.isObject(currentRow[name])) {

                    if (objKeys.length == 0) {
                        return;
                    }

                    _.forIn(obj, function (val, key) {
                        assignFieldValue(currentRow, propertyPrefix + key, val);
                    });
                }
                else if (_.isArray(currentRow[name])) {
                     console.warn("[ElasticsearchConnector] - unable to assign array value for field: " + name);
                }

            };

            var getDeeplyNestedValue = function(obj, propertyName){
                var props = propertyName.split('.');

                var currentValue = obj[props[0]];
                if(!currentValue){
                    return null;
                }
                for(var i = 1; i < props.length; i++){
                    currentValue = currentValue[props[i]];
                    if(!currentValue){
                        return null;
                    }
                }

                return currentValue;
            }

            // mash the data into an array of objects
            for (ii = 0; ii < hitsToProcess; ++ii) {

                var item = {};

                // Add blank fields to match the specified columns (otherwise Tableau complains
                // about this noisily in its log files
                _.each(connectionData.fields, function (field) {

                    var fieldValue = getDeeplyNestedValue(hits[ii]._source, field.name);
                    item[field.name] = _.isNull(fieldValue) || _.isUndefined(fieldValue) ? null : fieldValue;

                });

                // Copy over any formatted value to the source object
                _.each(connectionData.dateFields, function (field) {

                    if (!item[field]) {
                        return;
                    }

                    val = null;
                    if(_.isArray(item[field])){
                        val = item[field][0]
                    }
                    else{
                        val = item[field]
                    }

                    item[field] = moment.utc(val.replace(' +', '+')
                        .replace(' -', '-')).format('YYYY-MM-DD HH:mm:ss');
                });
                _.each(connectionData.geoPointFields, function (field) {

                    if (!item[field.name]) {
                        return;
                    }

                    var lat, lon = 0;

                    if( _.isArray(item[field.name])){
                        lat = item[field.name][0];
                        lon = item[field.name][1];
                    }
                    else if( _.isString(item[field.name])){
                        var latLonParts = item[field.name] ? item[field.name].split(', ') : [];
                        if (latLonParts.length != 2) {
                            console.log('[getTableData] Bad format returned for geo_point field: ' + field.name + '; value: ' + item[field.name]);
                            return;
                        }
                        lat = parseFloat(latLonParts[0]);
                        lon = parseFloat(latLonParts[1]);
                    }
                    else{
                        console.log('[getTableData] Bad format returned for geo_point field: ' + field.name + '; value: ' + item[field.name]);
                        return;
                    }

                    item[field.name + '_latitude'] = lat;
                    item[field.name + '_longitude'] = lon;
                });
                item._id = hits[ii]._id;
                item._sequence = totalCount + ii;

                toRet.push(item);
            }

            totalCount += hitsToProcess;
            // If we have a limit, retrieve up to that limit, otherwise
            // wait until we have no more results returned

            var moreRecords = connectionData.limit ?
                totalCount < connectionData.limit :
                data.hits.hits.length > 0;

            if(totalCount >= searchHitsTotal){
                console.log("[processSearchResults] Total search hits less or equal to the records already retrieved - no more records");
                moreRecords = false;
            }

            console.log('[processSearchResults] total processed ' + totalCount + ', limit: ' +
                connectionData.limit + ' more records?: ' + moreRecords + ', total search hits: ' + searchHitsTotal);

            if(tableauDataMode){
                table.appendRows(toRet);
            }            

            return { results: toRet, scrollId: data._scroll_id, numProcessed: toRet.length, more: moreRecords };

        } else {
            console.log("[getRemainingScrollResults] No results found for Elasticsearch query: " + JSON.stringify(requestData));
            if(tableauDataMode){
                table.appendRows([]);
            }            

            return ({results: [], scrollId: data._scroll_id, numProcessed: 0, more: false});
        }
    };

    var getAggregationResponse = function (tableauDataMode, table, cb) {

        var connectionData = JSON.parse(tableau.connectionData);

        if (!connectionData.elasticsearchUrl) {
            return;
        }

        var requestData = {};

        var strippedQuery = $.trim(connectionData.elasticsearchAggregationData.customQuery);
        if (!_.isEmpty(strippedQuery)){
            try {
                requestData = JSON.parse(connectionData.elasticsearchAggregationData.customQuery);
            }
            catch (err) {
                var errMsg = "Error parsing custom aggregation query: " + connectionData.elasticsearchAggregationData.customQuery + "\nError:" + err;
                if(cb) cb(errMsg);

                return abort(errMsg, tableauDataMode);
            }
        }
        else {
            requestData = buildAggregationRequest(connectionData.elasticsearchAggregationData);
        }

        // Dont return search results
        requestData.size = 0;

        var connectionUrl = connectionData.elasticsearchUrl + '/' + connectionData.elasticsearchIndex + '/' +
            connectionData.elasticsearchType + '/_search';

        var xhr = $.ajax({
            url: connectionUrl,
            method: 'POST',
            processData: false,
            data: JSON.stringify(requestData),
            dataType: 'json',
            beforeSend: function (xhr) {
                beforeSendAddAuthHeader(xhr, connectionData);
            },
            success: function (data) {

                var result = processAggregationData(data);
                if(result == null){
                    if(cb) cb("Error processing aggregation data in response, either missing or invalid");
                    if(tableauDataMode){
                        abort("Error processing aggregation data in response, either missing or invalid", true);
                    }
                }

                if(tableauDataMode){
                    table.appendRows(result);
                }

                if (cb) {
                    cb(null, result);
                }
                
            },
            error: function (xhr, ajaxOptions, err) {
                var error;
                if (xhr.status == 0) {
                    error = 'Error creating Elasticsearch scroll window, unable to connect to host or CORS request was denied';
                    if(cb) cb(error);
                    abort(error, tableauDataMode);
                }
                else {
                    error = "Error creating Elasticsearch scroll window, status code:  " + xhr.status + '; ' + xhr.responseText + "\n" + err
                    if(cb) cb(error);
                    abort(error, tableauDataMode);
                }
            }
        });
    };

    var processAggregationData = function (data) {

        var aggregations = data.aggregations;
        if (!aggregations) {
            abort("No 'aggregations' property in response");
            return null;
        }

        var rows = [];
        var currentRow = {};

        visitAggregationResponseLevels(aggregations, rows, currentRow);        

        return rows;
    };

    var visitAggregationResponseLevels = function (agg, rows, currentRow) {

        var connectionData = JSON.parse(tableau.connectionData),
            elasticsearchAggsMap = connectionData.aggFieldsMap;

        var keys = _.keys(agg),
            moreBucketsToVisit = false;
        _.each(keys, function (key) {

            var field = elasticsearchAggsMap[key];
            if(!field){
                return;
            }

            if (field.indexOf("bucket_") == 0) {
                moreBucketsToVisit = true;

                // Depth-first search into each bucket...
                _.each(agg[key].buckets, function (bucket) {

                    var bucketValue;
                    if (field.indexOf("bucket_date_histogram_") == 0) {
                        bucketValue = moment.utc(bucket.key_as_string).format('YYYY-MM-DD HH:mm:ss');
                    }
                    else {
                        bucketValue = bucket.key;
                    }
                    console.log(field + " = " + bucketValue)
                    currentRow[field] = bucketValue;

                    // Set the count field associated with this bucket (at the deepest level)
                    // TODO: Only set this when we are on a bucket agg at the deepest level
                    currentRow["metric_count"] = bucket.doc_count;
                    console.log("metric_count" + " = " + bucket.doc_count);

                    visitAggregationResponseLevels(bucket, rows, currentRow);
                });
            }

            if (field.indexOf("metric_") == 0) {
                if (field.indexOf("metric_sum_") == 0 ||
                    field.indexOf("metric_avg_") == 0 ||
                    field.indexOf("metric_min_") == 0 ||
                    field.indexOf("metric_max_") == 0 ||
                    field.indexOf("metric_count_") == 0) {

                    console.log(field + " = " + agg[key].value)
                    currentRow[field] = agg[key].value;
                }
                if (field.indexOf("metric_stats_") == 0) {
                    var fieldName = field.substring("metric_stats_".length)
                    console.log(field + " = " + JSON.stringify(agg[key]));

                    currentRow["metric_sum_" + fieldName] = agg[key].sum;
                    currentRow["metric_avg_" + fieldName] = agg[key].avg;
                    currentRow["metric_min_" + fieldName] = agg[key].min;
                    currentRow["metric_max_" + fieldName] = agg[key].max;
                    currentRow["metric_count_" + fieldName] = agg[key].count;
                }
                if (field.indexOf("metric_extended_stats_") == 0) {
                    var fieldName = field.substring("metric_extended_stats_".length);
                    console.log(field + " = " + JSON.stringify(agg[key]));

                    currentRow["metric_sum_" + fieldName] = agg[key].sum;
                    currentRow["metric_avg_" + fieldName] = agg[key].avg;
                    currentRow["metric_min_" + fieldName] = agg[key].min;
                    currentRow["metric_max_" + fieldName] = agg[key].max;
                    currentRow["metric_count_" + fieldName] = agg[key].count;
                    currentRow["metric_sum_of_squares_" + fieldName] = agg[key].sum_of_squares;
                    currentRow["metric_variance_" + fieldName] = agg[key].variance;
                    currentRow["metric_std_deviation_" + fieldName] = agg[key].std_deviation;
                    currentRow["metric_std_deviation_bounds_lower_" + fieldName] = agg[key].std_deviation_bounds.lower;
                    currentRow["metric_std_deviation_bounds_upper_" + fieldName] = agg[key].std_deviation_bounds.upper;
                }
            }


        });

        if (!moreBucketsToVisit) {

            var row = _.cloneDeep(currentRow);
            rows.push(row);

            currentRow = {};

            console.log("Did not find a child property that matches an aggregation name - depth reached");
            return;
        }

    };

    var parseAggregations = function (aggregations, mode) {

        var fields = [];

        firstLevelAggs = _.keys(aggregations);
        if (firstLevelAggs.length > 1) {
            abort("Should only supply a single bucket aggregation at each level, found the following aggregations: " + firstLevelAggs.join(", "));
            return null;
        }

        currentAggLevel = aggregations;
        while (currentAggLevel != null) {

            visitAggLevel(fields, currentAggLevel, mode);

            // Drill into any child aggregations
            var keys = _.keys(currentAggLevel),
                foundMoreLevels = false;
            _.each(keys, function (key) {
                var aggInfo = currentAggLevel[key];

                if (aggInfo.aggregations || aggInfo.aggs) {
                    foundMoreLevels = true;
                    currentAggLevel = aggInfo.aggs ? aggInfo.aggs : aggInfo.aggregations;
                }
                else{
                    // If we are at the deepest level and we are collecting metrics - add a count
                     if (mode == "metrics") {
                        fields.push({
                            name: "metric_count",
                            type: "integer"
                        });
                    }
                }
            });

            if(!foundMoreLevels){
                currentAggLevel = null;
            }
        }

        return fields;
    };

    var hasSupportedBucketAggregation = function (agg) {
        if (agg.date_histogram || agg.terms || agg.range || agg.date_range) {
            return true;
        }
        else {
            return false;
        }
    }

    var visitAggLevel = function (accumulatedFields, agg, mode) {

        var keys = _.keys(agg);

        _.each(keys, function (key) {

            var aggInfo = agg[key];

            if (mode == "buckets") {

                var field, name, type, format;

                // Only look at the first bucket
                if (aggInfo.date_histogram) {
                    field = aggInfo.date_histogram.field,
                    name = "bucket_date_histogram_" + field,
                    type = "date";
                }
                if (aggInfo.terms) {
                    field = aggInfo.terms.field;
                    name = "bucket_terms_" + field;
                    type = "string";
                }
                if (aggInfo.range) {

                    field = aggInfo.range.field;
                    name = "bucket_range_" + field;
                    type = "string";
                }
                if (aggInfo.date_range) {

                    field = aggInfo.date_range.field;
                    name = "bucket_date_range_" + field;
                    type = "string";
                }

                if (hasSupportedBucketAggregation(aggInfo)) {
                    accumulatedFields.push({
                        name: name,
                        type: type,
                        format: format
                    });
                    elasticsearchAggsMap[key] = name;
                }

                // TODO: Check to see if we have duplicate aggregation key names... would be a problem
            }
            if (mode == "metrics") {

                if (aggInfo.avg) {
                    field = aggInfo.avg.field;

                    accumulatedFields.push({
                        name: "metric_avg_" + field,
                        type: "float"
                    });
                    elasticsearchAggsMap[key] = "metric_avg_" + field;
                }
                if (aggInfo.sum) {
                    field = aggInfo.sum.field;

                    accumulatedFields.push({
                        name: "metric_sum_" + field,
                        type: "float"
                    });
                    elasticsearchAggsMap[key] = "metric_sum_" + field;
                }
                if (aggInfo.min) {
                    field = aggInfo.min.field;

                    accumulatedFields.push({
                        name: "metric_min_" + field,
                        type: "float"
                    });
                    elasticsearchAggsMap[key] = "metric_min_" + field;
                }
                if (aggInfo.max) {
                    field = aggInfo.max.field;

                    accumulatedFields.push({
                        name: "metric_max_" + field,
                        type: "float"
                    });
                    elasticsearchAggsMap[key] = "metric_max_" + field;
                }
                if (aggInfo.stats) {
                    field = aggInfo.stats.field;

                    accumulatedFields.push({
                        name: "metric_sum_" + field,
                        type: "float"
                    });
                    accumulatedFields.push({
                        name: "metric_min_" + field,
                        type: "float"
                    });
                    accumulatedFields.push({
                        name: "metric_max_" + field,
                        type: "float"
                    });
                    accumulatedFields.push({
                        name: "metric_avg_" + field,
                        type: "float"
                    });
                    accumulatedFields.push({
                        name: "metric_count_" + field,
                        type: "float"
                    });
                    elasticsearchAggsMap[key] = "metric_stats_" + field;
                }
                if (aggInfo.extended_stats) {
                    field = aggInfo.extended_stats.field;

                    accumulatedFields.push({
                        name: "metric_sum_" + field,
                        type: "float"
                    });
                    accumulatedFields.push({
                        name: "metric_min_" + field,
                        type: "float"
                    });
                    accumulatedFields.push({
                        name: "metric_max_" + field,
                        type: "float"
                    });
                    accumulatedFields.push({
                        name: "metric_avg_" + field,
                        type: "float"
                    });
                    accumulatedFields.push({
                        name: "metric_count_" + field,
                        type: "float"
                    });
                    accumulatedFields.push({
                        name: "metric_sum_of_squares_" + field,
                        type: "float"
                    });
                    accumulatedFields.push({
                        name: "metric_variance_" + field,
                        type: "float"
                    });
                    accumulatedFields.push({
                        name: "metric_std_deviation_" + field,
                        type: "float"
                    });
                    accumulatedFields.push({
                        name: "metric_std_deviation_bounds_lower_" + field,
                        type: "float"
                    });
                    accumulatedFields.push({
                        name: "metric_std_deviation_bounds_upper_" + field,
                        type: "float"
                    });
                    elasticsearchAggsMap[key] = "metric_extended_stats_" + field;
                }
            }

        });

    }

    var getAuthCredentials = function(connectionData){

        if(connectionData.useSyncClientWorkaround){
            return {
                username: connectionData.elasticsearchUsername,
                password: connectionData.elasticsearchPassword
            };
        }
        else{
            return {
                username: tableau.username,
                password: tableau.password
            };
        }
    };

    var beforeSendAddAuthHeader = function(xhr, connectionData){
        
        var creds = getAuthCredentials(connectionData);

        if (connectionData.elasticsearchAuthenticate && creds.username) {
            xhr.setRequestHeader("Authorization", "Basic " + btoa(creds.username + ":" + creds.password));
        }
    };

    var aggregationData;
    var updateAggregationData = function(data){
        aggregationData = data;
    };

    return {
        abort: abort,
        updateAggregationData: updateAggregationData,
        getElasticsearchConnectionFieldInfo: getElasticsearchConnectionFieldInfo,
        getElasticsearchTypeMapping: getElasticsearchTypeMapping,
        getSearchResponse: getSearchResponse,
        openSearchScrollWindow: openSearchScrollWindow,
        getRemainingScrollResults: getRemainingScrollResults,
        getAggregationResponse: getAggregationResponse
    }

})();

console.log("[ElasticsearchConnector]", elasticsearchConnector);

