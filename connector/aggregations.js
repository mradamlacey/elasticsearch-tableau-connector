var aggregations = (function () {

    var AggregationsViewModel = function() {

        var self = this;

        self.useCustomQuery = ko.observable(false);

        self.addMetric = function(){

            var connectionData = elasticsearchConnector.getTableauConnectionData();
            if(_.isEmpty(connectionData.elasticsearchUrl)){
                return elasticsearchConnector.abort("Must provide Elasticsearch URL to add metrics");
            }
            if(_.isEmpty(connectionData.elasticsearchIndex)){
                return elasticsearchConnector.abort("Must provide Elasticsearch Index to add metrics");
            }
            if(_.isEmpty(connectionData.elasticsearchType)){
                return elasticsearchConnector.abort("Must provide Elasticsearch Type to add metrics");
            }

            self.getUpdatedTypeFields();

            var metric = new Metric();

            self.metrics.push(metric);
        };

        self.removeMetric = function(){
            self.metrics.remove(this);
        };

        self.addBucket = function(){

            var connectionData = elasticsearchConnector.getTableauConnectionData();
            if(_.isEmpty(connectionData.elasticsearchUrl)){
                return elasticsearchConnector.abort("Must provide Elasticsearch URL to add metrics");
            }
            if(_.isEmpty(connectionData.elasticsearchIndex)){
                return elasticsearchConnector.abort("Must provide Elasticsearch Index to add metrics");
            }
            if(_.isEmpty(connectionData.elasticsearchType)){
                return elasticsearchConnector.abort("Must provide Elasticsearch Type to add metrics");
            }

            self.buckets.push(new Bucket());
        };

        self.removeBucket = function(){
            self.buckets.remove(this);
        };

        self.metrics = ko.observableArray([]);
        self.metricFields = ko.observableArray([]);
        self.getMetrics = function(){
            return self.metrics();
        };
        self.metricTypes = ko.observableArray([ "Count", "Sum", "Average", "Min", "Max", "Stats", "Extended Stats"]);

        self.buckets = ko.observableArray([]);
        self.getBuckets = function(){
            return self.buckets();
        };
        self.bucketTypes = ko.observableArray(["Date Range", "Date Histogram", "Range", "Terms"]);

        self.bucketFields = ko.observableArray([]);

        self.bucketDateRangeRanges = ko.observableArray([]);
        self.bucketRangeRanges = ko.observableArray([]);

        self.dateHistogramIntervals = ["Second", "Minute", "Hour", "Daily", "Weekly", "Monthly", "Yearly", "Custom"];

        self.customDateHistogramInterval = ko.observable();

        self.fields = ko.observableArray([]);

        self.getUpdatedTypeFields = function(cb){

            console.log("[Aggregations] Getting updated type mapping information");
            self.fields.removeAll();

            elasticsearchConnector.getElasticsearchTypeMapping(elasticsearchConnector.getTableauConnectionData(),
                function (err, data, connectionData) {

                    if (err) {
                        cb(err);
                        return elasticsearchConnector.abort(err);
                    }

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

                    if (data[indexName] == null) {
                        return elasticsearchConnector.abort("No mapping found for type: " + connectionData.elasticsearchType + " in index: " + indexName);
                    }

                    if (data[indexName].mappings == null) {
                        return elasticsearchConnector.abort("No mapping found for index: " + indexName);
                    }

                    if (data[indexName].mappings[connectionData.elasticsearchType] == null) {
                        return elasticsearchConnector.abort("No mapping properties found for type: " + connectionData.elasticsearchType + " in index: " + indexName);
                    }

                    _.forIn(data[indexName].mappings[connectionData.elasticsearchType].properties, function (val, key) {
                        // TODO: Need to support nested objects and arrays in some way

                        self.fields.push({name: key, type: val.type});

                        // Only add numeric fields
                        if(val.type != "long" && val.type != "double" && val.type != "int"){
                            return;
                        }

                        self.metricFields.push({name: key, type: val.type});
                    });

                    cb(null, data);
                });
        };

        self.updateTableauConnectionData = function(connectionData){

        };

    };

    var Metric = function(type, field){
        var self = this;

        self.type = ko.observable(type ? type : "Count");
        self.field = ko.observable(field);

        self.type.subscribe(function(newValue){
            updateAggregationData();
        });
        self.field.subscribe(function(newValue){
            updateAggregationData();
        });
    };

    var Bucket = function(type, field, options){

        var self = this;

        self.type = ko.observable(type ? type : "Terms");
        self.field = ko.observable(field);
        self.fields = ko.observableArray(["Test"]);

        self.updateFields = function(){

            self.fields.removeAll();

            vm.getUpdatedTypeFields(function(data){

                var newFields = [];

                switch(self.type() ? self.type()[0] : ""){
                    case "Terms":

                        newFields = _.map(vm.fields(), function(field){

                            if(field.type == "string" || field.type == "double" ||
                                field.type == "int" || field.type == "long" || field.type == "date"){
                                return field.name;
                            }
                            else{
                                return null;
                            }
                        });

                        break;

                    case "Date Range":
                        newFields = _.map(vm.fields(), function(field){

                            if(field.type == "date"){
                                return field.name;
                            }
                            else{
                                return null;
                            }

                        });

                        break;

                    case "Date Histogram":
                        newFields = _.map(vm.fields(), function(field){

                            if(field.type == "date"){
                                return field.name;
                            }
                            else{
                                return null;
                            }

                        });

                        break;

                    case "Range":

                        newFields = _.map(vm.fields(), function(field){

                            if(field.type == "double" || field.type == "int" || field.type == "long"){
                                return field.name;
                            }
                            else{
                                return null;
                            }

                        });

                        break;

                }

                newFields = _.filter(newFields, function(field){return field != null});

                _.each(newFields, function(newField){
                    self.fields.push(newField);
                });

            });
        };

        self.type.subscribe(function(newValue){
            self.updateFields();
            updateAggregationData();
        });
        self.field.subscribe(function(newValue){
            updateAggregationData();
        });

        // Set list of fields based on the initial value for 'type'
        self.updateFields();
    };

    var vm = new AggregationsViewModel();
    ko.applyBindings(vm);

    vm.useCustomQuery.subscribe(function(newValue) {
        console.log("[Aggregations] Removing all metrics and buckets");
        
        vm.metrics.removeAll();
        vm.buckets.removeAll();
    });

    vm.metrics.subscribe(function(newValue){
        updateAggregationData();
    });

    vm.buckets.subscribe(function(newValue){
        updateAggregationData();
    });

    var updateAggregationData = function(){

        var metrics = _.map(vm.getMetrics(), function(metric){
            return {
                type: metric.type() ? metric.type()[0] : null,
                field: metric.field() ? metric.field()[0].name : null
            };
        });
        var buckets = _.map(vm.getBuckets(), function(bucket){
            return {
                type: bucket.type() ? bucket.type()[0] : null,
                field: bucket.field() ? bucket.field()[0] : null
            };
        });


        var data = {
            filter: null,
            metrics: metrics,
            buckets: buckets
        };
        elasticsearchConnector.updateAggregationData(data);
    };

    return vm;
})();

console.log("[Aggregations]", aggregations);