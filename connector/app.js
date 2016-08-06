var app = (function () {

    var AppViewModel = function() {

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

        self.batchSize = ko.observable(10);
        self.limit = ko.observable(100);

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

        self.isErrorVisible = ko.computed(function(){
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
                elasticsearchQuery: self.searchCustomQuery(),
                elasticsearchResultMode: self.resultMode(),
                elasticsearchAggregationData: aggregations.getAggregationData(),
                useSyncClientWorkaround: self.useSyncClientWorkaround(),
                batchSize: self.batchSize(),
                limit: self.limit()
            };

            return connectionData;
        }

        self.isPreviewVisible = ko.observable(false);
        self.isPreviewDataLoading = ko.observable(false);
        self.previewFields = ko.observableArray([]);
        self.previewData = ko.observableArray([]);

        self.previewDataRaw = [];

        self.preview = function () {

            self.previewFields.removeAll();
            self.previewData.removeAll();
            self.previewDataRaw = [];

            self.isPreviewVisible(true);
            self.isPreviewDataLoading(true);

            setTimeout(function () {
                $('html, body').animate({
                    scrollTop: $("#preview-results").offset().top
                }, 250);
            }, 500);

            self.getElasticsearchFieldData(function (err, esFieldData) {

                _.each(esFieldData.fields, function(field){
                    self.previewFields.push(field.name);
                });

                elasticsearchConnector.openSearchScrollWindow(false, function (err, result) {

                    if (err) {
                        self.isPreviewVisible(false);
                        self.isPreviewDataLoading(false);
                        return toastr.error("Error getting preview data: " + err);
                    }

                    console.log("[App] - preview - opened search scroll window");

                    self.previewDataRaw = self.previewDataRaw.concat(result.results);
                    elasticsearchConnector.getNextScrollResult(false, result.scrollId, self.processNextScrollResult);

                });
            });


        };

        self.processNextScrollResult = function(err, result){

            if(err){     
                self.isPreviewVisible(false);
                self.isPreviewDataLoading(false);        
                return toastr.error("Error getting preview data: " + err);
            }

            if(result.results.length == 0){
                self.isPreviewDataLoading(false); 
                self.previewData(self.previewDataRaw);
                return;
            }

            self.previewDataRaw = self.previewDataRaw.concat(result.results);            
            elasticsearchConnector.getNextScrollResult(false, result.scrollId, self.processNextScrollResult);
        };

        self.submit = function(){

            self.getElasticsearchFieldData(function(err, esFieldData){

                if(err){
                    return toastr.error(err);
                }

                tableauData.updateProperties(esFieldData);

                if (tableau.phase == tableau.phaseEnum.interactivePhase || tableau.phase == tableau.phaseEnum.authPhase) {
                    console.log("[App] Submitting tableau interactive phase data");
                    tableau.submit();
                }
                else {
                    self.abort('Invalid phase: ' + tableau.phase + ' aborting', true);
                }
            });
        
        }

        self.abort = function(errorMessage, kill) {

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

     self.getElasticsearchFieldData = function(cb){
            var messages = [];

            if(self.resultMode() == "aggregation"){
                var aggData = aggregations.getAggregationData();
                tableauData.updateProperties({elasticsearchAggregationData: aggData});

                var aggValidation = self.aggregations.validate();
                messages = aggValidation.messages;
            }

            self.validate();

            if((self.validation() && self.validation().messages.length > 0) ||
                messages.length > 0){

                messages = messages.concat(self.validation().messages);

                if(cb) cb(messages.join("<br />"));
            }

            // We have all the configuration filled for what data we want to retrieve from Elasticsearch
            // Go retrieve the actual fields and data types in order to update the Tableau connection data
            elasticsearchConnector.getElasticsearchConnectionFieldInfo(tableauData.getUnwrapped(), function (err, esFieldData) {
                if (err) {
                    console.log("[App] - error returned from getElasticsearchConnectionFieldInfo");
                    if(cb) cb(err);
                    return;
                }

                if(cb){
                    cb(null, esFieldData)
                }
            });
        };

        self.validate = function(){

            var validation = {
                messages: []
            };

            if(self.useBasicAuthentication()){
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

            if(!self.elasticsearchUrl()){
                validation.messages.push("Elasticsearch URL is required");
                validation.elasticsearchUrl = true
            }
            else{
                var isValid =isValidUrl(self.elasticsearchUrl());

                if(!isValid) validation.messages.push("Elasticsearch URL is not a valid URL");
                validation.elasticsearchUrl = !isValid;
            }

            if(!self.elasticsearchIndex()){
                validation.messages.push("Elasticsearch Index is required");
                validation.elasticsearchIndex = true
            }
            else{
                validation.elasticsearchIndex = false;
            }

            if (!self.elasticsearchType()) {
                validation.messages.push("Elasticsearch Type is required");
                validation.elasticsearchType = true
            }
            else {
                validation.elasticsearchType = false;
            }

            if(self.useCustomQuery()){
                if(!self.searchCustomQuery()){
                    validation.messages.push("Custom query is required");
                    validation.searchCustomQuery = true;
                }
                else{
                    validation.searchCustomQuery = false;
                }
            }

            self.validation(validation);
        };

    };

    var isValidUrl = function(str) {
        var pattern = new RegExp('^(https?:\/\/)?' + // protocol
            '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\.)+[a-z]{2,}|' + // domain name
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

    var _getAuthCredentials = function(connectionData){

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

    var _beforeSendAddAuthHeader = function(xhr, connectionData){
        
        var creds = _getAuthCredentials(connectionData);

        if (connectionData.elasticsearchAuthenticate && creds.username) {
            xhr.setRequestHeader("Authorization", "Basic " + btoa(creds.username + ":" + creds.password));
        }
    };

    var vm = new AppViewModel();

    ///////////////////////////////////////////////////////////////////////////////////////////
    // Subscribe to changes in the VM and keep the tableau properties in sync
    ///////////////////////////////////////////////////////////////////////////////////////////
    vm.useBasicAuthentication.subscribe(function(newValue){

        if(newValue === false){
            vm.username("");
            vm.password("");
            vm.useSyncClientWorkaround(false);
        }

        tableauData.updateAuthCredentials(vm.useBasicAuthentication(), vm.useSyncClientWorkaround(), vm.username(), vm.password());
    });

    vm.username.subscribe(function(newValue){
        tableauData.updateAuthCredentials(vm.useBasicAuthentication(), vm.useSyncClientWorkaround(), vm.username(), vm.password());
    });

    vm.password.subscribe(function(newValue){
        tableauData.updateAuthCredentials(vm.useBasicAuthentication(), vm.useSyncClientWorkaround(), vm.username(), vm.password());
    });

    vm.useSyncClientWorkaround.subscribe(function(newValue){
        tableauData.updateAuthCredentials(vm.useBasicAuthentication(), vm.useSyncClientWorkaround(), vm.username(), vm.password());
    });

    vm.elasticsearchUrl.subscribe(function(newValue){

        vm.elasticsearchIndex("");
        vm.elasticsearchType("");

        vm.previewFields.removeAll();
        vm.previewData.removeAll();
        vm.previewDataRaw = [];

        vm.aggregations.clear();
        tableauData.updateProperties(vm.getTableauConnectionData());
    });

    vm.elasticsearchIndex.subscribe(function(newValue){
        
        vm.elasticsearchType("");

        vm.previewFields.removeAll();
        vm.previewData.removeAll();
        vm.previewDataRaw = [];

        vm.aggregations.clear();
        tableauData.updateProperties(vm.getTableauConnectionData());
    });

    vm.elasticsearchType.subscribe(function(newValue){
        vm.previewFields.removeAll();
        vm.previewData.removeAll();
        vm.previewDataRaw = [];

        vm.aggregations.clear();
        tableauData.updateProperties(vm.getTableauConnectionData());
    });

    vm.searchCustomQuery.subscribe(function(newValue){
        vm.previewFields.removeAll();
        vm.previewData.removeAll();
        vm.previewDataRaw = [];

        tableauData.updateProperties(vm.getTableauConnectionData());
    });

    vm.batchSize.subscribe(function(newValue){
        tableauData.updateProperties(vm.getTableauConnectionData());
    });

    vm.limit.subscribe(function(newValue){
        tableauData.updateProperties(vm.getTableauConnectionData());
    });

    vm.resultMode.subscribe(function(newValue){
        console.log("[App] resultMode changed: " + newValue);

        self.previewFields.removeAll();
        self.previewData.removeAll();
        vm.previewDataRaw = [];
        
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
