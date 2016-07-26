var tableauData = (function () {

    var self = this;

    var _data = ko.observable({

    });

    var updateProperties = function (updatedMap) {

        var connectionData = _data();

        if (updatedMap) {
            _.forIn(updatedMap, function (val, key) {
                if(key == "elasticsearchUsername" || key == "elasticsearchPassword" || 
                   key == "elasticsearchAuthenticate" || key == "useSyncClientWorkaround"){
                    return;
                }
                connectionData[key] = val;
            });
        }

        // Update private property that stores current connection data
        _data(connectionData);

        tableau.connectionData = JSON.stringify(connectionData);

        console.log('[TableauData] updateProperties - Connection data: ' + tableau.connectionData);
        return connectionData;
    };

    var updateAuthCredentials = function(useBasicAuth, useSyncClientWorkaround, username, password){

        var connectionData = _data();

        connectionData.elasticsearchAuthenticate = useBasicAuth;
        connectionData.useSyncClientWorkaround = useSyncClientWorkaround;

        // Don't store username/password in the tableau.username/tableau.password properties
        // as these cause issues with the Online Sync Client
        if(!useSyncClientWorkaround){
            tableau.username = username;
            tableau.password = password;

            delete connectionData.elasticsearchUsername;
            delete connectionData.elasticsearchPassword;
        }
        else{
            tableau.username = null;
            tableau.password = null;

            connectionData.elasticsearchUsername = username;
            connectionData.elasticsearchPassword = password;
        }

        // Update private property that stores current connection data
        _data(connectionData);

        tableau.connectionData = JSON.stringify(connectionData);

        console.log('[TableauData] updateAuthCredentials - Connection data: ' + tableau.connectionData);
        return connectionData;
    }

    return {
        init: function(){
            console.log("[TableauData] init...");
        },
        get: function(){
            console.log("[TableauData] returning data");
            return _data;
        },
        getUnwrapped: function(){
            console.log("[TableauData] returning data unwrapped");
            return _data();            
        },
        updateProperties: updateProperties,
        updateAuthCredentials: updateAuthCredentials
    }

})();

console.log("[TableauData]", tableauData);
