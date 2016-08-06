var aggregations = (function () {

    var AggregationsViewModel = function() {

        var self = this;

        self.tableauData = {};
        self.tableauDataSubscription = null;
        self.setTableauData = function(tableauData){

            if(self.tableauDataSubscription){
                self.tableauDataSubscription.dispose();
            }

            if(!ko.isObservable(tableauData)){
                return console.error("[Aggregations] Bad argument to setTableauData, not an observable value");
            }

            self.tableauDataSubscription = tableauData.subscribe(function(newValue){

                if(!_.isObject(newValue)){
                    return;
                }

                if(_.trim(self.tableauData.elasticsearchUrl) != _.trim(newValue.elasticsearchUrl)){
                    self.metrics.removeAll();
                    self.buckets.removeAll()
                }

                self.tableauData = newValue;
            });

            self.tableauData = tableauData();
        };

        self.useCustomQuery = ko.observable(false);

        self.useCustomQuery.subscribe(function(newValue){
            self.aggregationFilter("");
            self.buckets.removeAll();
            self.metrics.removeAll();
            self.customQuery("");
        });
        self.customQuery = ko.observable();

        self.useAggFilter = ko.observable(false);

        self.aggregationFilter = ko.observable();

        self.clear = function(){
            self.useCustomQuery(false);
            self.customQuery("");
            self.useAggFilter(false);
            self.aggregationFilter("");
            self.buckets.removeAll();
            self.metrics.removeAll();
        }

        self.addMetric = function(){

            var connectionData = self.tableauData;
            if(_.isEmpty(connectionData.elasticsearchUrl)){
                return elasticsearchConnector.abort("Must provide Elasticsearch URL to add metrics");
            }
            if(_.isEmpty(connectionData.elasticsearchIndex)){
                return elasticsearchConnector.abort("Must provide Elasticsearch Index to add metrics");
            }
            if(_.isEmpty(connectionData.elasticsearchType)){
                return elasticsearchConnector.abort("Must provide Elasticsearch Type to add metrics");
            }

            self.getUpdatedTypeFields(function(err, data){
                if(err) return;

                var metric = new Metric();
                self.metrics.push(metric);

                self.validate();
            });
                        
        };

        self.removeMetric = function(){
            self.metrics.remove(this);
        };

        self.addBucket = function(){

            var connectionData = self.tableauData;
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

            self.validate();
        };

        self.removeBucket = function(){
            self.buckets.remove(this);
        };

        self.metrics = ko.observableArray([]);
        self.metricFields = ko.observableArray([]);
        self.getMetricFieldValue = function(selectedItem){

            // Seleced value is the same as the name, use this as optionsValue binding so KO will preserve selected
            // option if the options array changes
            return selectedItem.name;
        };
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

        self.dateHistogramIntervalOptions = ["Every Second", "Every Minute", "Hourly", "Daily", "Weekly", "Monthly", "Yearly", "Custom"];

        self.customDateHistogramInterval = ko.observable();

        self.fields = ko.observableArray([]);

        self.getUpdatedTypeFields = function(cb){

            console.log("[Aggregations] Getting updated type mapping information");
            self.fields.removeAll();

            var currentMetricFieldSelections = _.map(self.metrics(), function(metric){
                return metric.field();
            });

            elasticsearchConnector.getElasticsearchTypeMapping(self.tableauData,
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

                    var err;
                    if (data[indexName] == null) {
                        err = "No mapping found for type: " + connectionData.elasticsearchType + " in index: " + indexName;
                        if(cb){
                            cb(err);
                        }
                        return elasticsearchConnector.abort(err);
                    }

                    if (data[indexName].mappings == null) {
                        err = "No mapping found for index: " + indexName;
                        if(cb){
                            cb(err);
                        }
                        return elasticsearchConnector.abort(err);
                    }

                    if (data[indexName].mappings[connectionData.elasticsearchType] == null) {
                        err = "No mapping properties found for type: " + connectionData.elasticsearchType + " in index: " + indexName;
                        if(cb){
                            cb(err);
                        }
                        return elasticsearchConnector.abort(err);
                    }

                    self.fields.removeAll();
                    self.metricFields.removeAll();

                    _.forIn(data[indexName].mappings[connectionData.elasticsearchType].properties, function (val, key) {
                        // TODO: Need to support nested objects and arrays in some way

                        self.fields.push({name: key, type: val.type});

                        // Only add numeric fields
                        if(val.type != "long" && val.type != "double" && val.type != "int"){
                            return;
                        }

                        self.metricFields.push({name: key, type: val.type});
                    });

                    _.each(currentMetricFieldSelections, function(currentSelection, index){
                        self.metrics()[index].field(currentSelection);
                    });

                    if(!cb){
                        return;
                    }

                    cb(null, data);
                });
        };

        self.updateTableauConnectionData = function(connectionData){

        };

        self.validation = ko.observable({ messages: [] });

        self.validate = function(){ 

            var validation = {
                messages: []
            };
        

            if (self.useCustomQuery()) {
                if (!self.customQuery()) {
                    validation.messages.push("Custom query is required");
                    validation.customQuery = true;
                }
                else {
                    validation.customQuery = false;
                }
            }
            else {
                if (self.metrics().length == 0) {
                    validation.messages.push("Must add at least one metric");
                    validation.metrics = true;
                }
                else {
                    validation.metrics = false;
                }

                if (self.buckets().length == 0) {
                    validation.messages.push("Must add at least one bucket");
                    validation.buckets = true;
                }
                else {
                    validation.buckets = false;

                    _.each(self.buckets(), function(bucket){
                        validation.messages = validation.messages.concat(bucket.validate().messages);
                    });
                }

                if(self.useAggFilter()){
                    if (!self.aggregationFilter()) {
                        validation.messages.push("Aggregation filter is required");
                        validation.aggregationFilter = true;
                    }
                    else {
                        validation.aggregationFilter = false;
                    }
                }
            }

            self.validation(validation);

            return validation;
        };

    };

    var Metric = function(type, field){
        var self = this;

        self.type = ko.observable(type ? type : "Count");
        self.field = ko.observable(field);

        self.type.subscribe(function(newValue){

        });
        self.field.subscribe(function(newValue){

        });
    };

    var Bucket = function(type, field, options){

        var self = this;

        self.type = ko.observable(type ? type : ["Terms"]);
        self.field = ko.observable(field);
        self.fields = ko.observableArray([]);
        self.termSize = ko.observable(0);
        self.dateHistogramType = ko.observable();
        self.dateHistogramCustomInterval = ko.observable();
        self.ranges = ko.observableArray([]);
        self.dateRanges = ko.observableArray([]);
        self.dateRangeTypes = ko.observableArray(["Relative", "Absolute", "Custom"]);
        self.relativeOptions = ko.observableArray([ "Minute(s) ago", "Hour(s) ago", "Day(s) ago", "Week(s) ago", "Month(s) ago", "Quarter(s) ago", "Year(s) ago"]);

        self.validation = ko.observable({ messages: []});

        self.validate = function(){
            var validation = {
                messages: []
            };

            if(self.type() == "Date Histogram"){

                var customIntervalRegex = /\d+[MmdYsw]/g;

                if(self.dateHistogramType() == "Custom"){
                    if(!customIntervalRegex.test(self.dateHistogramCustomInterval())){
                        validation.messages.push("Invalid custom interval");
                        validation.dateHistogramCustomInterval = true;
                    }
                }
            }

            if(self.type() == "Date Range"){

                if(self.dateRanges().length < 2){
                    validation.ranges = true;
                    validation.messages.push("Must include at least 2 ranges");
                }
                else{
                    _.each(self.dateRanges(), function(range){
                        validation.messages = validation.messages.concat(range.validate().messages);
                    });
                }
            }
            if(self.type() == "Range"){
                if(self.ranges().length < 2){
                    validation.ranges = true;
                    validation.messages.push("Must include at least 2 ranges");
                }
                else{
                    _.each(self.ranges(), function(range){
                        validation.messages = validation.messages.concat(range.validate().messages);
                    });

                    for(var i = 0; i < self.ranges().length - 1; i++){
                        var currRange = self.ranges()[i],
                            nextRange = self.ranges()[i + 1],
                            currTo = parseFloat(currRange.to()),
                            nextFrom = parseFloat(nextRange.from());

                        if(currTo > nextFrom){
                            validation.messages.push("Range #" + (i+1) + " 'To' is greater than the next range's 'From'");
                            validation.ranges = true;
                        }
                    }

                    for(var i = 0; i < self.ranges().length; i++){
                        if(i != 0){
                            if(!self.ranges()[i].from()){
                                validation.messages.push("Range #" + (i+1) + " 'From' is required");
                                validation.ranges = true;
                            }
                        }
                        if(i != self.ranges().length - 1){
                            if(!self.ranges()[i].to()){
                                validation.messages.push("Range #" + (i+1) + " 'To' is required");
                                validation.ranges = true;
                            }
                        }
                    }
                }
            }

            self.validation(validation);

            return validation;
        };

        self.addRange = function(){
            var range;

            // If we have a previous range - prefill the from portion of the new range
            // with the 'to' portion of the last range
            if(self.ranges().length > 0){
                var lastRange = self.ranges()[self.ranges().length - 1];

                range = new Range(lastRange.to(), null, 
                                  lastRange.relativeNumTo(), null,
                                  lastRange.toRelative(), null,
                                  lastRange.toType(), null);
            }
            else{
               range = new Range(); 
            }
            self.ranges.push(range);

            self.validate();
        };

        self.removeRange = function(){
            self.ranges.remove(this);
        };

        self.addDateRange = function(){
            var range;

            // If we have a previous range - prefill the from portion of the new range
            // with the 'to' portion of the last range
            if(self.dateRanges().length > 0){
                var lastRange = self.dateRanges()[self.dateRanges().length - 1];
                range = new Range(lastRange.to(), null, 
                                  lastRange.relativeNumTo(), null,
                                  lastRange.toRelative(), null,
                                  lastRange.toType(), null);
            }
            else{
               range = new Range(); 
            }

            self.dateRanges.push(range);
        };

        self.removeDateRange = function(){
            self.dateRanges.remove(this);
        };

        self.updateFields = function(){

            vm.getUpdatedTypeFields(function(data){

                var newFields = [];

                switch(self.type() ? self.type() : ""){
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

                self.fields.removeAll();

                _.each(newFields, function(newField){
                    self.fields.push(newField);
                });

            });
        };

        self.type.subscribe(function(newValue){
            self.updateFields();
        });
        self.field.subscribe(function(newValue){

        });
        self.termSize.subscribe(function(newValue){

        });
        self.dateHistogramType.subscribe(function(newValue){
            if(newValue != "Custom"){
                self.dateHistogramCustomInterval("");
            }

        });
        self.dateHistogramCustomInterval.subscribe(function(newValue){

        });
        self.ranges.subscribe(function(newValue){

        });
        self.dateRanges.subscribe(function(newValue){

        });

    };

    var Range = function(from, to, relativeNumFrom, relativeNumTo, fromRelative, toRelative, fromType, toType){
        var self = this;

        self.from = ko.observable(from);
        self.relativeNumFrom = ko.observable(relativeNumFrom ? relativeNumFrom : 1);
        self.fromRelative = ko.observable(fromRelative ? fromRelative : null);
        self.to = ko.observable(to);
        self.relativeNumTo = ko.observable(relativeNumTo ? relativeNumTo : 1);
        self.toRelative = ko.observable(toRelative ? toRelative : null);

        self.fromType = ko.observable(fromType ? fromType : 'Relative');
        self.toType = ko.observable(toType ? toType : 'Relative');

        self.validation = ko.observable({ messages: []});

        self.validate = function(){
            var validation = {
                messages: []
            };

            if(self.from()){
                var from = parseFloat(self.from());
                if(isNaN(from)){
                    validation.from = true;
                    validation.messages.push("'From' is not a valid number");
                }

                if (self.to()) {
                    var to = parseFloat(self.to());
                    if (isNaN(to)) {
                        validation.to = true;
                        validation.messages.push("'To' is not a valid number");
                    }
                    else{
                        if(to <= from){
                            validation.to = true;
                            validation.messages.push("'To' should be greater than 'From'");                          
                        }
                    }
                }
            }

            self.validation(validation);

            return validation;
        };

        self.from.subscribe(function(newValue){

        });
        self.to.subscribe(function(newValue){

        });
        self.relativeNumFrom.subscribe(function(newValue){            

        });
        self.relativeNumTo.subscribe(function(newValue){            

        });
        self.fromRelative.subscribe(function(newValue){            

        });
        self.toRelative.subscribe(function(newValue){            

        });
        self.fromType.subscribe(function(newValue){
            self.from("");
        });
        self.toType.subscribe(function(newValue){
            self.to("");
        });
    };

    var vm = new AggregationsViewModel();

    vm.useCustomQuery.subscribe(function(newValue) {
        console.log("[Aggregations] Removing all metrics and buckets");
        
        vm.metrics.removeAll();
        vm.buckets.removeAll();
    });

    vm.metrics.subscribe(function(newValue){

    });

    vm.buckets.subscribe(function(newValue){

    });

    vm.useAggFilter.subscribe(function(newValue){

        if(!newValue){
            vm.aggregationFilter("");
        }

    });

    vm.aggregationFilter.subscribe(function(){

    });

    var getAggregationData = function(){
        var metrics = _.map(vm.getMetrics(), function(metric){
            return {
                type: metric.type() ? metric.type() : null,
                field: metric.field() && metric.field() ? metric.field().name : null
            };
        });

        var relativeOptionsMap = {
            "Minute(s) ago" : "m/m", 
            "Hour(s) ago": "h/h", 
            "Day(s) ago": "d/d", 
            "Week(s) ago": "w/w", 
            "Month(s) ago": "M/M", 
            "Quarter(s) ago": "q/q", 
            "Year(s) ago": "y/y"
        };

        var buckets = _.map(vm.getBuckets(), function(bucket){
            return {
                type: bucket.type() ? bucket.type() : null,
                field: bucket.field() ? bucket.field() : null,
                termSize: bucket.termSize(),
                dateHistogramType: bucket.dateHistogramType() && bucket.dateHistogramType() ? bucket.dateHistogramType() : bucket.dateHistogramType(),
                dateHistogramCustomInterval: bucket.dateHistogramCustomInterval(),
                ranges: _.map(bucket.ranges(), function(range){
                    return {
                        from: range.from(),
                        to: range.to()
                    };
                }),
                dateRanges: _.map(bucket.dateRanges(), function(range){
                    var from, to;
                    if(range.fromType() == "Absolute"){
                        from = moment.utc(range.from()).format('YYYY-MM-DD[T]HH:mm:ss');
                    }
                    if(range.fromType() == "Custom"){
                        from = range.from();
                    }
                    if(range.fromType() == "Relative"){
                        if(isNaN(parseInt(range.relativeNumFrom())) || range.relativeNumFrom() == 0){
                            from = "now";
                        }
                        else{
                            from = "now-" + range.relativeNumFrom() + relativeOptionsMap[range.fromRelative()];
                        }
                    }

                    if(range.toType() == "Absolute"){
                        to = moment.utc(range.to()).format('YYYY-MM-DD[T]HH:mm:ss');
                    }
                    if(range.toType() == "Custom"){
                        to = range.to();
                    }
                    if(range.toType() == "Relative"){
                        if(isNaN(parseInt(range.relativeNumTo())) || range.relativeNumTo() == 0){
                            to = "now";
                        }
                        else{
                            to = "now-" + range.relativeNumTo() + relativeOptionsMap[range.toRelative()];
                        }
                        
                    }
                    return {
                        from: from,
                        to: to
                    };
                })
            };
        });

        var data = {
            filter: vm.useAggFilter() ? vm.aggregationFilter() : null,
            metrics: metrics,
            buckets: buckets,
            useCustomQuery: vm.useCustomQuery(),
            customQuery: vm.customQuery()
        };

        return data;
    }

    vm.getAggregationData = getAggregationData;

    return vm;
})();

console.log("[Aggregations]", aggregations);