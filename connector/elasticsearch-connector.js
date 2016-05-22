 (function() {

  var elasticsearchTableauDataTypeMap = {
    string: 'string',
    float: 'float',
    long: 'int',
    integer: 'int',
    date: 'datetime',
    boolean: 'bool',
    geo_point: 'string'
  },
    elasticsearchFields = [],
    elasticsearchFieldsMap = {},
    elasticsearchDateFields = [],
    elasticsearchGeoPointFields = [],
    elasticsearchIndices = [],
    elasticsearchTypes = [],
    startTime,
    endTime;
  
  var addElasticsearchField = function(name, esType, format, hasLatLon){
    
      if(_.isUndefined(elasticsearchTableauDataTypeMap[esType])){
          return;
      }
                  
      elasticsearchFields.push({ name: name, dataType: elasticsearchTableauDataTypeMap[esType] });
      elasticsearchFieldsMap[name] = { type: elasticsearchTableauDataTypeMap[esType], format: format };
      
      if(esType == 'date'){
          elasticsearchDateFields.push(name);
      }
      
      if(esType == 'geo_point'){
          elasticsearchGeoPointFields.push({name: name, hasLatLon: hasLatLon});
          addElasticsearchField(name + '_latitude', 'float');
          addElasticsearchField(name + '_longitude', 'float');
      }
  }
  
  var getElasticsearchTypeMapping = function(connectionData){

      tableau.log('Calling getElasticsearchTypeMapping');

        addElasticsearchField('_id', 'string');
        addElasticsearchField('_sequence', 'integer');

    $.ajax(connectionData.elasticsearchUrl + '/' + connectionData.elasticsearchIndex + '/' + 
           connectionData.elasticsearchType + '/_mapping', {
      context: connectionData,
      dataType: 'json',
      beforeSend: function(xhr) { 
          if(connectionData.elasticsearchAuthenticate && connectionData.elasticsearchUsername){
              xhr.setRequestHeader("Authorization", "Basic " + 
                btoa(connectionData.elasticsearchUsername + ":" + connectionData.elasticsearchPassword));             
          }

        },
      success: function(data){
              
              var connectionData = this;
              console.log(connectionData);
              console.log(data);  
        
        var indexName = connectionData.elasticsearchIndex;
        
        // Then we selected an alias... choose the last index with a matching type name
        // TODO: Let user choose which type from which index
        if(data[connectionData.elasticsearchIndex] == null){
            _.forIn(data, function(index, indexKey){
                if(index.mappings[connectionData.elasticsearchType]){
                    indexName = indexKey;
                }
            });
        }
        _.forIn(data[indexName].mappings[connectionData.elasticsearchType].properties, function(val, key){
            // TODO: Need to support nested objects and arrays in some way
            addElasticsearchField(key, val.type, val.format, val.lat_lon)    
        });
        
        tableau.log('Number of header columns: ' + elasticsearchFields.length);
        
        var connectionData = getTableauConnectionData();
      
        var connectionName = $('#inputConnectionName').val();
        tableau.connectionName = connectionName ? connectionName : "Elasticsearch Datasource";
        
        updateTableauConnectionData();        
      
        startTime = moment();
        $('#myPleaseWait').modal('show');
          if(tableau.phase == tableau.phaseEnum.interactivePhase || tableau.phase == tableau.phaseEnum.authPhase) {
              console.log('Submitting tableau interactive phase data');
              tableau.submit();
          }
          else{
              abortWithError('Invalid phase: ' + tableau.phase + ' aborting');
          }

      },
      error: function(xhr, ajaxOptions, err){
        if(xhr.status == 0){
          abort('Request error, unable to connect to host or CORS request was denied');
        }
        else{
          abort('Request error, status code: ' + xhr.status + '; ' + xhr.responseText + '\n' + err);
        }          
      }
    }); 
  }

  function abort(errorMessage){
      
      $('#divMessage').css('display', 'none');
      
      $('#divError').css('display', 'block');
      $('#errorText').text(errorMessage);  
      
      $('html, body').animate({
        scrollTop: $("#divError").offset().top
    }, 500);
    
      tableau.log(errorMessage);
      tableau.abortWithError(errorMessage);    
  }
  
  //
  // Connector definition
  // 

  var myConnector = tableau.makeConnector();

  myConnector.getColumnHeaders = function() {

      var connectionData;

      try{
          connectionData = JSON.parse(tableau.connectionData);
      }
      catch(ex){
          abort("Error parsing tableau connection data: \n", ex);
          return;
      }

    
    tableau.log('getColumnHeaders called, headers: ' + _.pluck(connectionData.fields, 'name').join(', '));
    tableau.headersCallback(_.pluck(connectionData.fields, 'name'), _.pluck(connectionData.fields, 'dataType'));
  };
   
  var totalCount = 0,
      searchHitsTotal = -1;
  
  myConnector.getTableData = function(lastRecordToken) {
    
    tableau.log('getTableData called, lastRecordToken: ' + lastRecordToken);
    
    var lastTo = parseInt(lastRecordToken) || 0;
    var connectionData = JSON.parse(tableau.connectionData);
      
    var requestData = {}; 
    if(connectionData.elasticsearchQuery){
      try{
          requestData = JSON.parse(connectionData.elasticsearchQuery); 
      }
      catch(err){
          abort("Error parsing custom query: \n" + err);
          return;
      }
        
      requestData.from = lastTo;
              
    }
    else{
        requestData = {
            query: { match_all: {} },
            from: lastTo,
            size: connectionData.batchSize
        };  
    }
    
    // If we have any date fields - add a scripted field to the request to format the value to what Tableau expects

    if(connectionData.dateFields.length > 0){
        var dateFormatScriptTmpl = _.template("use( groovy.time.TimeCategory ){ new Date( doc[\"<%= field %>\"].value ).format(\"yyyy-MM-dd HH:mm:ss\") }");
    
        requestData._source = '*';
        requestData.script_fields = {};
      
        _.each(connectionData.dateFields, function(field){
            var script = dateFormatScriptTmpl({field: field});
            requestData.script_fields[field] = {
                script: script
            };
        });
    }
    
      // Figure out how many to request up to the limit or total 
      // search result count
      if((searchHitsTotal > -1 && lastTo + connectionData.batchSize > searchHitsTotal) ||
         (connectionData.limit && lastTo + connectionData.batchSize > connectionData.limit)){
        
          var minLimit = connectionData.limit ? Math.min(connectionData.limit, searchHitsTotal) :
                         searchHitsTotal;
           
          requestData.size = minLimit - lastTo;   
      }
      else{
          requestData.size = connectionData.batchSize;  
      }
    
	var connectionUrl = connectionData.elasticsearchUrl + '/' + connectionData.elasticsearchIndex + '/' + 
                      connectionData.elasticsearchType + '/_search';
	
  tableau.log('Elasticsearch query: ' + JSON.stringify(requestData));
  
    var xhr = $.ajax({
        url: connectionUrl,
        method: 'POST',
        processData: false,
        data: JSON.stringify(requestData),
        dataType: 'json',
        beforeSend: function(xhr) { 
          if(connectionData.elasticsearchAuthenticate && connectionData.elasticsearchUsername){
              xhr.setRequestHeader("Authorization", "Basic " + 
                btoa(connectionData.elasticsearchUsername + ":" + connectionData.elasticsearchPassword));             
          }

        },
        success: function (data) {

        // Update the total count of the search results
        searchHitsTotal = data.hits.total;

        var limit = connectionData.limit ? connectionData.limit : data.hits.total;
    
			  if (data.hits.hits) {
              var hits = data.hits.hits;
              var ii;
              var toRet = [];
              
              // mash the data into an array of objects
              for (ii = 0; ii < hits.length; ++ii) {
                  
                  var item = hits[ii]._source;
                  // Copy over any formatted value to the source object
                  _.each(connectionData.dateFields, function(field){
                      item[field] = hits[ii].fields[field];
                      //item[field] = moment(item[field]).format('YYYY-MM-DD HH:mm:ss');
                  });
                  _.each(connectionData.geoPointFields, function(field){
                      var latLonParts = item[field.name] ? item[field.name].split(', ') : [];
                      if(latLonParts.length != 2){
                        tableau.log('Bad format returned for geo_point field: ' + field.name + '; value: ' + item[field.name]);
                        return;
                      }
                      item[field.name + '_latitude'] = parseFloat(latLonParts[0]);
                      item[field.name + '_longitude'] = parseFloat(latLonParts[1]);                     
                  });
                  item._id = hits[ii]._id;
                  item._sequence = requestData.from + ii;
          
                  toRet.push(item);
              }
              var nextTo = requestData.from + toRet.length;
              totalCount = toRet.length > 0 ? toRet[toRet.length - 1]._sequence + 1 : 0;
              
              // Call back to tableau with the table data and the new record number (this is stored as a string)
              var moreRecords = requestData.from + toRet.length < limit && requestData.from + toRet.length < data.hits.total;
              tableau.dataCallback(toRet, nextTo.toString(), moreRecords);
            } else {
              abort("No results found for Elasticsearch query: " + JSON.stringify(requestData));
            }
            
        },
        error: function (xhr, ajaxOptions, err) {
          if(xhr.status == 0){
            abort('Request error, unable to connect to host or CORS request was denied');
          }
          else{
            abort("Request error, status code:  " + xhr.status + '; ' + xhr.responseText + "\n" + err);
          }          
        }
    });
  };
  
  myConnector.init = function(){

      console.log('tableay:init fired');

      if (tableau.phase == tableau.phaseEnum.interactivePhase){
          $('.no-tableau').css('display', 'none');
          $('.tableau').css('display', 'block');

          initUIControls();
      }
    
    tableau.initCallback();
  }

  myConnector.shutdown = function(){
      endTime = moment();
      var runTime = endTime.diff(startTime) / 1000;
      $('#myPleaseWait').modal('hide');
      
      $('#divError').css('display', 'none');      
      $('#divMessage').css('display', 'block');
      $('#messageText').text(totalCount + ' total rows retrieved, in: ' + runTime + ' (s)');  
      
      $('html, body').animate({
        scrollTop: $("#divMessage").offset().top
    }, 500);
    
      tableau.log('Shutdown callback...');
      tableau.shutdownCallback();
  };
  
  tableau.registerConnector(myConnector);

  //
  // Setup connector UI
  //
 
  $(document).ready(function() {

      console.log('Document ready fired...');

  });

     var initUIControls = function(){
         $('#cbUseQuery').change(function() {
             if($(this).is(":checked")) {
                 $('#divQuery').css('display', 'block');
             }
             else{
                 $('#divQuery').css('display', 'none');
                 $('#inputUsername').val('');
                 $('#inputPassword').val('');
             }

             updateTableauConnectionData();
         });

         $('#cbUseBasicAuth').change(function() {
             if($(this).is(":checked")) {
                 $('.basic-auth-control').css('display', 'block');
             }
             else{
                 $('.basic-auth-control').css('display', 'none');
                 $('#textElasticsearchQuery').val('');
             }

             updateTableauConnectionData();
         });

         $("#submitButton").click(function(e) { // This event fires when a button is clicked
             e.preventDefault();

             // Retrieve the Elasticsearch mapping before we call tableau submit
             // There is a bug when getColumnHeaders is invoked, and you call 'headersCallback'
             // asynchronously
             getElasticsearchTypeMapping(getTableauConnectionData());

         });

         $("#inputElasticsearchIndexTypeahead").typeahead({source: function(something, cb){

             getElasticsearchIndices(function(err, indices){

                 if(err){
                     return abort(err);
                 }

                 getElasticsearchAliases(function(err, aliases){

                     if(err){
                         return abort(err);
                     }
                     var sourceData = indices.concat(_.uniq(aliases));

                     // Return the actual list of items to the control
                     cb(sourceData);
                 });

             });
         },
             autoSelect: true,
             showHintOnFocus: true,
             items: 'all' });

         $("#inputElasticsearchTypeTypeahead").typeahead({source:function(something, cb){

             var connectionData = getTableauConnectionData();
             getElasticsearchTypes(connectionData.elasticsearchIndex, function(err, types){
                 if(err){
                     return abort(err);
                 }

                 // Return the actual list of items to the control
                 cb(types);
             });
         },
             autoSelect: true,
             showHintOnFocus: true,
             items: 'all' });

     };
  
  var getElasticsearchTypes = function (indexName, cb) {

      var connectionData = getTableauConnectionData();
      var connectionUrl = connectionData.elasticsearchUrl + '/' + indexName + '/_mapping';

      var xhr = $.ajax({
          url: connectionUrl,
          method: 'GET',
          contentType: 'application/json',
          dataType: 'json',
          beforeSend: function (xhr) {
              if (connectionData.elasticsearchAuthenticate && connectionData.elasticsearchUsername) {
                  xhr.setRequestHeader("Authorization", "Basic " +
                      btoa(connectionData.elasticsearchUsername + ":" + connectionData.elasticsearchPassword));
              }

          },
          success: function (data) {

              var indices = _.keys(data);
              var typeMap = {};
              
              var esTypes = [];
              
              _.each(indices, function(index){
                  var types = _.keys(data[index].mappings);
                  
                  esTypes = esTypes.concat(types);
              });

              cb(null, esTypes);
          },
          error: function (xhr, ajaxOptions, err) {
              if (xhr.status == 0) {
                  cb('Request error, unable to connect to host or CORS request was denied');
              }
              else {
                  cb("Request error, status code:  " + xhr.status + '; ' + xhr.responseText + "\n" + err);
              }
          }
      });
  }
  
  var getElasticsearchIndices = function(cb){
      
      var connectionData = getTableauConnectionData();
      var connectionUrl = connectionData.elasticsearchUrl + '/_mapping';

      var xhr = $.ajax({
          url: connectionUrl,
          method: 'GET',
          contentType: 'application/json',
          dataType: 'json',
          beforeSend: function (xhr) {
              if (connectionData.elasticsearchAuthenticate && connectionData.elasticsearchUsername) {
                  xhr.setRequestHeader("Authorization", "Basic " +
                      btoa(connectionData.elasticsearchUsername + ":" + connectionData.elasticsearchPassword));
              }

          },
          success: function (data) {

              var indices = _.keys(data);

              cb(null, indices);
          },
          error: function (xhr, ajaxOptions, err) {
              if (xhr.status == 0) {
                  cb('Request error, unable to connect to host or CORS request was denied');
              }
              else {
                  cb("Request error, status code:  " + xhr.status + '; ' + xhr.responseText + "\n" + err);
              }
          }
      });
  }
  
    var getElasticsearchAliases = function(cb){
      
      var connectionData = getTableauConnectionData();
      var connectionUrl = connectionData.elasticsearchUrl + '/_aliases';

      var xhr = $.ajax({
          url: connectionUrl,
          method: 'GET',
          contentType: 'application/json',
          dataType: 'json',
          beforeSend: function (xhr) {
              if (connectionData.elasticsearchAuthenticate && connectionData.elasticsearchUsername) {
                  xhr.setRequestHeader("Authorization", "Basic " +
                      btoa(connectionData.elasticsearchUsername + ":" + connectionData.elasticsearchPassword));
              }

          },
          success: function (data) {

              var aliasMap = {},
                  aliases = [];
                  
              _.forIn(data, function(value, key){
                  aliases = aliases.concat(_.keys(value.aliases));
              });

              cb(null, aliases);
          },
          error: function (xhr, ajaxOptions, err) {
              if (xhr.status == 0) {
                  cb('Request error, unable to connect to host or CORS request was denied');
              }
              else {
                  cb("Request error, status code:  " + xhr.status + '; ' + xhr.responseText + "\n" + err);
              }
          }
      });
  }
  
  var getTableauConnectionData = function(){
    
    var max_iterations = parseInt($('#inputBatchSize').val()) == NaN ? 10 : parseInt($('#inputBatchSize').val());
    var limit = parseInt($('#inputTotalLimit').val()) == NaN ? null : parseInt($('#inputTotalLimit').val());
    var connectionName = $('#inputConnectionName').val();
    var auth = $('#cbUseBasicAuth').is(':checked');
    var username = $('#inputUsername').val();
    var password = $('#inputPassword').val();
    var esUrl = $('#inputElasticsearchUrl').val();
    var esIndex = $('#inputElasticsearchIndexTypeahead').val();
    var esType = $('#inputElasticsearchTypeTypeahead').val();
    var esQuery = $('#textElasticsearchQuery').val();
    
    var connectionData = {
        elasticsearchUrl: esUrl,
        elasticsearchAuthenticate: auth,
        elasticsearchUsername: username,
        elasticsearchPassword: password,
        elasticsearchIndex: esIndex,
        elasticsearchType: esType,
        elasticsearchQuery: esQuery,
        fields: elasticsearchFields,
        fieldsMap: elasticsearchFieldsMap,
        dateFields: elasticsearchDateFields,
        geoPointFields: elasticsearchGeoPointFields,
        batchSize:  max_iterations,
        limit: limit
      };
      
      return connectionData; 
  };
  
  var updateTableauConnectionData = function(updatedMap){
    
      var connectionData = getTableauConnectionData();
      
      if(updatedMap){
          _.forIn(updateMap, function(val, key){
              connectionData[key] = val;
          });        
      }

      tableau.connectionData = JSON.stringify(connectionData);  
      
      tableau.log('Connection data: ' + tableau.connectionData);    
      return connectionData; 
  }
    
})();