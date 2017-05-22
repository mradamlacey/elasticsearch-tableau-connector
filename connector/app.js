var app = (function () {

    var AppViewModel = function () {

        var self = this;

        self.connectionName = ko.observable();
        self.useBasicAuthentication = ko.observable(false);
        self.useSyncClientWorkaround = ko.observable(false);
        self.username = ko.observable();
        self.password = ko.observable();
        self.elasticsearchUrl = ko.observable();
        self.elasticsearchIndex = ko.observable();

        self.resultMode = ko.observable("search");

        self.useCustomQuery = ko.observable(false);
        self.searchCustomQuery = ko.observable();

        self.useIncrementalRefresh = ko.observable(false);
        self.incrementalRefreshColumns = ko.observableArray([]);
        self.incrementalRefreshColumn = ko.observable();

        self.batchSize = ko.observable(10);
        self.limit = ko.observable(100);

        self.pauseSubscriptions = ko.observable(false);

        self.tableauInteractive = ko.observable(false);
        self.loaded = ko.observable(false);

        self.init = function(){
            elasticsearchConnector.subscribeInitEvent(function(connectionData){

                if (tableau.phase == tableau.phaseEnum.interactivePhase) {
                    console.log("[app] Connector UI called from Tableau WDC interactive mode, phase: ", tableau.phase)
                    self.tableauInteractive(true);
                }
                else if (!_.isNull(tableau.phase) && !_.isUndefined(tableau.phase)) {
                    console.log("[app] Connector UI called in phase: " + tableau.phase);
                }
                else{
                    console.log("[app] Connector UI called in standalone mode");
                }

                console.log("[app.init] Elasticsearch connector init fired!");
                self.setWithTableauConnectionData(connectionData);
                
                self.loaded(true);
            });
        };

        self.setWithTableauConnectionData = function (connectionData) {
            if (connectionData == null) {
                console.error("[app.setWithTableauConnectionData] [ERROR] - connectionData is null")
                return;
            }

            var tableauToVMMap = {
                "elasticsearchAuthenticate": "useBasicAuthentication",
                "elasticsearchUsername": "username",
                "elasticsearchPassword": "password",
                "elasticsearchQuery": "searchCustomQuery",
                "elasticsearchResultMode": "resultMode"
            };

            _.each(connectionData, function (val, key) {

                // Assume if we stored a key with the same name as we have on this ViewModel that it's a KO observable

                vmPropertyName = tableauToVMMap[key] ? tableauToVMMap[key] : key;

                if (_.isFunction(self[vmPropertyName])){

                    if (vmPropertyName == 'resultMode'){
                        return;
                    }

                    console.log("[app] - updating observable [" + vmPropertyName + "]", val);
                    self[vmPropertyName](val);
                }

            });

            if(connectionData != null){
                 vm.getElasticsearchFieldData(function(err, fieldData){
                     if(err){
                         return;
                     }
                      updateIncrementalRefreshColumns(err, fieldData);

                      vm.incrementalRefreshColumn(connectionData.incrementalRefreshColumn);
                 }, true);
            }

            if (connectionData != null && connectionData.elasticsearchAggregationData != null) {

                // Set Result mode and aggregation data separately
                self.pauseSubscriptions(true);

                console.log("Setting result mode to: " + connectionData.elasticsearchResultMode);
                self.resultMode(connectionData.elasticsearchResultMode);

                var aggData = connectionData.elasticsearchAggregationData;
                self.aggregations.pauseSubscriptions(true);
                console.log("Setting aggregations: ", aggData);

                self.aggregations.useCustomQuery(aggData.useCustomQuery)
                self.aggregations.aggregationFilter(aggData.filter)
                self.aggregations.useAggFilter(aggData.useAggFilter)
                self.aggregations.customQuery(aggData.customQuery)


                self.aggregations.getUpdatedTypeFields(function (err, data) {
                    if (err) {
                        console.error("[app] Error in getting aggregation type fields");
                        self.aggregations.pauseSubscriptions(false);
                        self.pauseSubscriptions(false);
                        return;

                    };

                    _.each(aggData.metrics, function (metric) {
                        var vmMetric = new self.aggregations.NewMetric(metric.type, metric.field);
                        self.aggregations.metrics.push(vmMetric);
                    });

                    _.each(aggData.buckets, function (bucket) {

                        var ranges = [];
                        var dateRanges = [];

                        _.each(bucket.ranges, function(range){
                             var vmRange = new self.aggregations.NewRange(range.type, range.from, range.to, range.relativeNumFrom, 
                                                                          range.relativeNumTo, range.fromRelative, range.toRelative, range.fromType, range.toType);
                            ranges.push(vmRange);
                        });
                        _.each(bucket.dateRanges, function(range){
                             var vmRange = new self.aggregations.NewRange(range.type, range.from, range.to, range.relativeNumFrom, 
                                                                          range.relativeNumTo, range.fromRelative, range.toRelative, range.fromType, range.toType);
                            dateRanges.push(vmRange);
                        });

                        var options = {
                            termSize: bucket.termSize,
                            dateHistogramType: bucket.dateHistogramType,
                            dateHistogramCustomInterval: bucket.dateHistogramCustomInterval,
                            ranges: ranges,
                            dateRanges: dateRanges
                        };

                        var vmBucket = new self.aggregations.NewBucket(bucket.type, bucket.field, options);
                        self.aggregations.buckets.push(vmBucket);
                    });
                });

                self.aggregations.pauseSubscriptions(false);
                self.pauseSubscriptions(false);
            }

            tableauData.updateProperties(vm.getTableauConnectionData());
        }

        self.elasticsearchIndexSource = function (something, cb) {

            $('.index-icon').toggleClass('hide');

            self.getElasticsearchIndices(function (err, indices) {

                if (err) {
                    $('.index-icon').toggleClass('hide');
                    return self.abort(err);
                }

                self.getElasticsearchAliases(function (err, aliases) {

                    $('.index-icon').toggleClass('hide');

                    if (err) {
                        return self.abort(err);
                    }
                    var sourceData = indices.concat(_.uniq(aliases));

                    // Return the actual list of items to the control
                    cb(sourceData);
                });

            });
        };

        self.elasticsearchTypeSource = function (something, cb) {

            $('.type-icon').toggleClass('hide');

            var connectionData = tableauData.getUnwrapped();
            self.getElasticsearchTypes(connectionData.elasticsearchIndex, function (err, types) {
                $('.type-icon').toggleClass('hide');

                if (err) {
                    return self.abort(err);
                }

                // Return the actual list of items to the control
                cb(types);
            });
        };

        self.elasticsearchType = ko.observable();


        self.errorMessage = ko.observable();

        self.isErrorVisible = ko.computed(function () {
            return !self.errorMessage();
        });

        aggregations.setTableauData(tableauData.get());
        self.aggregations = aggregations;

        self.validation = ko.observable({});

        self.getTableauConnectionData = function () {

            var connectionData = {
                connectionName: self.connectionName(),
                elasticsearchUrl: self.elasticsearchUrl(),
                elasticsearchAuthenticate: self.useBasicAuthentication(),
                elasticsearchUsername: self.username(),
                elasticsearchPassword: self.password(),
                elasticsearchIndex: self.elasticsearchIndex(),
                elasticsearchType: self.elasticsearchType(),
                useCustomQuery: self.useCustomQuery(),
                elasticsearchQuery: self.searchCustomQuery(),
                elasticsearchResultMode: self.resultMode(),
                elasticsearchAggregationData: aggregations.getAggregationData(),
                useSyncClientWorkaround: self.useSyncClientWorkaround(),
                useIncrementalRefresh: self.useIncrementalRefresh(),
                incrementalRefreshColumn: self.incrementalRefreshColumn(),
                batchSize: self.batchSize(),
                limit: self.limit()
            };

            return connectionData;
        }

        self.isPreviewVisible = ko.observable(false);
        self.isPreviewDataLoading = ko.observable(false);
        self.previewFields = ko.observableArray([]);
        self.previewData = ko.observableArray([]);

        self.preview = function () {

            self.previewFields.removeAll();
            self.previewData.removeAll();

            self.isPreviewVisible(true);
            self.isPreviewDataLoading(true);

            setTimeout(function () {
                $('html, body').animate({
                    scrollTop: $("#preview-results").offset().top
                }, 250);
            }, 250);

            self.getElasticsearchFieldData(function (err, esFieldData) {

                if (err) {
                    self.isPreviewVisible(false);
                    self.isPreviewDataLoading(false);
                    return toastr.error(err);
                }

                _.each(esFieldData.fields, function (field) {
                    self.previewFields.push(elasticsearchConnector.toSafeTableauFieldName(field.name));
                });

                tableauData.updateProperties(esFieldData);

                if (self.resultMode() == "search") {
                    elasticsearchConnector.getSearchResponse(false, null, function (err, result) {
                        if (err) {
                            self.isPreviewVisible(false);
                            self.isPreviewDataLoading(false);
                            return toastr.error("Error getting preview data: " + err);
                        }

                        console.log("[App] - preview - opened search scroll window");

                        self.previewData(result.results);
                        self.isPreviewDataLoading(false);
                    });
                }

                if (self.resultMode() == "aggregation") {

                    elasticsearchConnector.getAggregationResponse(false, null, function (err, result) {

                        if (err) {
                            self.isPreviewVisible(false);
                            self.isPreviewDataLoading(false);
                            return toastr.error("Error getting preview data: " + err);
                        }

                        console.log("[App] - preview - received aggregation response");
                        self.previewData(result);

                        self.isPreviewDataLoading(false);
                    });
                }

            });


        };

        self.submit = function () {

            if(!self.tableauInteractive()){
                var err = "[app] [ERROR] Not in Tableau WDC interactive mode, returning...";
                return toastr.error(err);
            }

            self.getElasticsearchFieldData(function (err, esFieldData) {

                if (err) {
                    return self.abort(err, true);
                }

                tableauData.updateProperties(esFieldData);

                console.log("[App] Submitting tableau interactive phase data");
                tableau.submit();
            });

        }

        self.abort = function (errorMessage, kill) {

            self.errorMessage(errorMessage);

            toastr.error(errorMessage);

            console.error(errorMessage);
            if (kill) {
                tableau.abortWithError(errorMessage);
            }

        };

        self.getElasticsearchTypes = function (indexName, cb) {

            var connectionData = tableauData.getUnwrapped();

            if (!connectionData) {
                console.log("[App] getElasticsearchTypes - no connection data, nothing to do");
                return;
            }
            if (!connectionData.elasticsearchUrl || !connectionData.elasticsearchIndex) {
                console.log("[App] getElasticsearchTypes - no Elasticsearch URL or index, nothing to do");
                return;
            }

            var connectionUrl = connectionData.elasticsearchUrl + '/' + indexName + '/_mapping';

            var xhr = $.ajax({
                url: connectionUrl,
                method: 'GET',
                contentType: 'application/json',
                dataType: 'json',
                beforeSend: function (xhr) {
                    _beforeSendAddAuthHeader(xhr, connectionData);
                },
                success: function (data) {

                    self.errorMessage("");

                    var indices = _.keys(data);
                    var typeMap = {};

                    var esTypes = [];

                    _.each(indices, function (index) {
                        var types = _.keys(data[index].mappings);

                        esTypes = esTypes.concat(types);
                    });

                    cb(null, esTypes);
                },
                error: function (xhr, ajaxOptions, err) {
                    if (xhr.status == 0) {
                        cb('Unable to get Elasticsearch types, unable to connect to host or CORS request was denied');
                    }
                    else {
                        cb("Unable to get Elasticsearch types, status code:  " + xhr.status + '; ' + xhr.responseText + "\n" + err);
                    }
                }
            });
        }

        self.getElasticsearchIndices = function (cb) {

            var connectionData = tableauData.getUnwrapped();

            if (!connectionData) {
                console.log("[App] getElasticsearchIndices - no connection data, nothing to do");
                return;
            }
            if (!connectionData.elasticsearchUrl) {
                console.log("[App] getElasticsearchIndices - no Elasticsearch URL, nothing to do");
                return;
            }

            var connectionUrl = connectionData.elasticsearchUrl + '/_mapping';

            var xhr = $.ajax({
                url: connectionUrl,
                method: 'GET',
                contentType: 'application/json',
                dataType: 'json',
                beforeSend: function (xhr) {
                    _beforeSendAddAuthHeader(xhr, connectionData);
                },
                success: function (data) {

                    self.errorMessage("");

                    var indices = _.keys(data);

                    cb(null, indices);
                },
                error: function (xhr, ajaxOptions, err) {
                    if (xhr.status == 0) {
                        cb('Unable to get Elasticsearch indices, unable to connect to host or CORS request was denied');
                    }
                    else {
                        cb("Unable to get Elasticsearch indices, status code:  " + xhr.status + '; ' + xhr.responseText + "\n" + err);
                    }
                }
            });
        }

        self.getElasticsearchAliases = function (cb) {

            var connectionData = tableauData.getUnwrapped();

            if (!connectionData) {
                console.log("[App] getElasticsearchIndices - no connection data, nothing to do");
                return;
            }
            if (!connectionData.elasticsearchUrl) {
                console.log("[App] getElasticsearchIndices - no Elasticsearch URL, nothing to do");
                return;
            }

            var connectionUrl = connectionData.elasticsearchUrl + '/_aliases';

            var xhr = $.ajax({
                url: connectionUrl,
                method: 'GET',
                contentType: 'application/json',
                dataType: 'json',
                beforeSend: function (xhr) {
                    _beforeSendAddAuthHeader(xhr, connectionData);
                },
                success: function (data) {

                    self.errorMessage("");

                    var aliasMap = {},
                        aliases = [];

                    _.forIn(data, function (value, key) {
                        aliases = aliases.concat(_.keys(value.aliases));
                    });

                    cb(null, aliases);
                },
                error: function (xhr, ajaxOptions, err) {
                    if (xhr.status == 0) {
                        cb('Unable to get Elasticsearch aliases, unable to connect to host or CORS request was denied');
                    }
                    else {
                        cb("Unable to get Elasticsearch aliases, status code:  " + xhr.status + '; ' + xhr.responseText + "\n" + err);
                    }
                }
            });
        };

        self.getElasticsearchFieldData = function (cb, initialLoad) {
            var messages = [];

            var connectionData = tableauData.getUnwrapped();

            if (initialLoad === true) {
                if(connectionData == null){
                    return cb("Connection Data not provided for Elasticsearch", null);
                }
                if (!connectionData.elasticsearchUrl || !connectionData.elasticsearchIndex || !connectionData.elasticsearchType) {
                    return cb("Connection Data not provided for Elasticsearch", null);
                }
            }

            if (self.resultMode() == "aggregation") {
                var aggData = aggregations.getAggregationData();
                tableauData.updateProperties({ elasticsearchAggregationData: aggData });

                if (initialLoad === true) {
                    // Skip validation...
                }
                else {
                    var aggValidation = self.aggregations.validate();
                    messages = aggValidation.messages;
                }

            }

            if (initialLoad === true) {
                // Skip validation...
            }
            else {

                self.validate();

                if ((self.validation() && self.validation().messages.length > 0) ||
                    messages.length > 0) {

                    messages = messages.concat(self.validation().messages);

                    if (cb) cb(messages.join("<br />"));
                    return;
                }
            }

            // We have all the configuration filled for what data we want to retrieve from Elasticsearch
            // Go retrieve the actual fields and data types in order to update the Tableau connection data
            elasticsearchConnector.getElasticsearchConnectionFieldInfo(tableauData.getUnwrapped(), function (err, esFieldData) {
                if (err) {
                    console.log("[App] - error returned from getElasticsearchConnectionFieldInfo");
                    if (cb) cb(err);
                    return;
                }

                if (cb) {
                    cb(null, esFieldData)
                }
            });
        };

        self.validate = function () {

            var validation = {
                messages: []
            };

            if (self.useBasicAuthentication()) {
                if (!self.username()) {
                    validation.messages.push("Username is required");
                    validation.username = true
                }
                else {
                    validation.username = false;
                }

                if (!self.password()) {
                    validation.messages.push("Password is required");
                    validation.password = true
                }
                else {
                    validation.password = false;
                }
            }

            if (!self.elasticsearchUrl()) {
                validation.messages.push("Elasticsearch URL is required");
                validation.elasticsearchUrl = true
            }
            else {
                var isValid = isValidUrl(self.elasticsearchUrl());

                if (!isValid) validation.messages.push("Elasticsearch URL is not a valid URL");
                validation.elasticsearchUrl = !isValid;
            }

            if (!self.elasticsearchIndex()) {
                validation.messages.push("Elasticsearch Index is required");
                validation.elasticsearchIndex = true
            }
            else {
                validation.elasticsearchIndex = false;
            }

            if (!self.elasticsearchType()) {
                validation.messages.push("Elasticsearch Type is required");
                validation.elasticsearchType = true
            }
            else {
                validation.elasticsearchType = false;
            }

            if (self.useCustomQuery()) {
                if (!self.searchCustomQuery()) {
                    validation.messages.push("Custom query is required");
                    validation.searchCustomQuery = true;
                }
                else {
                    validation.searchCustomQuery = false;
                }
            }

            self.validation(validation);
        };

    };

    var isValidUrl = function (str) {
        var pattern = new RegExp('^(https?:\/\/)?' + // protocol
            '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\.)+[a-z\\d]{2,}|' + // domain name
            '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
            '(\\:\\d+)?(\/[-a-z\\d%_.~+]*)*' + // port and path
            '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
            '(\\#[-a-z\\d_]*)?$', 'i'); // fragment locater
        if (!pattern.test(str)) {
            return false;
        }
        else {
            return true;
        }
    }

    var _getAuthCredentials = function (connectionData) {

        if (connectionData.useSyncClientWorkaround) {
            return {
                username: connectionData.elasticsearchUsername,
                password: connectionData.elasticsearchPassword
            };
        }
        else {
            return {
                username: tableau.username,
                password: tableau.password
            };
        }
    };

    var _beforeSendAddAuthHeader = function (xhr, connectionData) {

        var creds = _getAuthCredentials(connectionData);

        if (connectionData.elasticsearchAuthenticate && creds.username) {
            xhr.setRequestHeader("Authorization", "Basic " + btoa(creds.username + ":" + creds.password));
        }
    };

    var vm = new AppViewModel();

    ///////////////////////////////////////////////////////////////////////////////////////////
    // Subscribe to changes in the VM and keep the tableau properties in sync
    ///////////////////////////////////////////////////////////////////////////////////////////
    vm.useBasicAuthentication.subscribe(function (newValue) {

        if (newValue === false) {
            vm.username("");
            vm.password("");
            vm.useSyncClientWorkaround(false);
        }

        tableauData.updateAuthCredentials(vm.useBasicAuthentication(), vm.useSyncClientWorkaround(), vm.username(), vm.password());
    });

    vm.username.subscribe(function (newValue) {
        tableauData.updateAuthCredentials(vm.useBasicAuthentication(), vm.useSyncClientWorkaround(), vm.username(), vm.password());
    });

    vm.password.subscribe(function (newValue) {
        tableauData.updateAuthCredentials(vm.useBasicAuthentication(), vm.useSyncClientWorkaround(), vm.username(), vm.password());
    });

    vm.useSyncClientWorkaround.subscribe(function (newValue) {
        tableauData.updateAuthCredentials(vm.useBasicAuthentication(), vm.useSyncClientWorkaround(), vm.username(), vm.password());
    });

    var updateIncrementalRefreshColumns = function(err, fieldData){

        var incrementalRefreshColumn = vm.incrementalRefreshColumn();

        if(err){
            console.error("[app] Unable to refresh incremental refresh fields");
            return;
        }

        console.log("[app] Getting elasticsearch incremental refresh fields...", fieldData);

        vm.incrementalRefreshColumns.removeAll();
        _.each(fieldData.fields, function(field){
            if(field.name == "_id" || field.name == "_sequence"){
                return;
            }
            
            vm.incrementalRefreshColumns.push(field);
        });

        console.log("[app] Resetting incremental refresh column value to: " + incrementalRefreshColumn);

        if(incrementalRefreshColumn){
            vm.incrementalRefreshColumn(incrementalRefreshColumn);
        }
    };

    vm.elasticsearchUrl.subscribe(function (newValue) {

        vm.elasticsearchIndex("");
        vm.elasticsearchType("");

        vm.previewFields.removeAll();
        vm.previewData.removeAll();

        vm.aggregations.clear();
        tableauData.updateProperties(vm.getTableauConnectionData());

        vm.getElasticsearchFieldData(updateIncrementalRefreshColumns);
    });

    vm.elasticsearchIndex.subscribe(function (newValue) {

        vm.elasticsearchType("");

        vm.previewFields.removeAll();
        vm.previewData.removeAll();

        vm.aggregations.clear();
        tableauData.updateProperties(vm.getTableauConnectionData());

        vm.getElasticsearchFieldData(updateIncrementalRefreshColumns);
    });

    vm.elasticsearchType.subscribe(function (newValue) {
        vm.previewFields.removeAll();
        vm.previewData.removeAll();

        vm.aggregations.clear();
        tableauData.updateProperties(vm.getTableauConnectionData());

        vm.getElasticsearchFieldData(updateIncrementalRefreshColumns);
    });

    vm.useCustomQuery.subscribe(function(newValue){
        if( newValue == false){
            console.log("Setting use custom query to false...")
            vm.searchCustomQuery();
        }
        else{
            tableauData.updateProperties(vm.getTableauConnectionData());
        }  
    });

    vm.searchCustomQuery.subscribe(function (newValue) {
        vm.previewFields.removeAll();
        vm.previewData.removeAll();

        tableauData.updateProperties(vm.getTableauConnectionData());
    });

    vm.useIncrementalRefresh.subscribe(function (newValue) {
        tableauData.updateProperties(vm.getTableauConnectionData());
    });

     vm.incrementalRefreshColumn.subscribe(function (newValue) {
        tableauData.updateProperties(vm.getTableauConnectionData());
    });

    vm.batchSize.subscribe(function (newValue) {
        tableauData.updateProperties(vm.getTableauConnectionData());
    });

    vm.limit.subscribe(function (newValue) {
        tableauData.updateProperties(vm.getTableauConnectionData());
    });

    vm.resultMode.subscribe(function (newValue) {
        if(vm.pauseSubscriptions()){
            return;
        }

        console.log("[App] resultMode changed: " + newValue);

        vm.previewFields.removeAll();
        vm.previewData.removeAll();
        vm.isPreviewVisible(false);

        vm.aggregations.clear();
        tableauData.updateProperties(vm.getTableauConnectionData());
    });

    //    vm.aggregations.getAggregationData().subscribe(function(newValue){
    //        console.log("[App] aggregations changed: " + newValue);
    //    });

    ///////////////////////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////////

    ko.applyBindings(vm);

    toastr.options.positionClass = "toast-top-center";
    toastr.options.preventDuplicates = true;

    return vm;

})();

console.log("[App]", app);
app.init();
