var koCustomBindings = (function () {

    // Bootstrap DatePicker
    ko.bindingHandlers.bootstrapDatePicker = {
        init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
            $(element).datepicker({
               todayBtn: "linked"
            });
        }
    };

    ko.bindingHandlers.bootstrapPopover = {
     init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
            $(element).popover({            
                container: "body",
                trigger: "hover"
            });
        }   
    };

    ko.bindingHandlers.typeahead = {
        init: function(element, valueAccessor, allBindings, viewModel, bindingContext){

            var value = valueAccessor();
            var valueUnwrapped = ko.unwrap(value);

            var source = allBindings.get('typeaheadSource');

            $(element).typeahead({
                source: source,
                autoSelect: true,
                showHintOnFocus: true,
                items: 'all',
                fitToElement: true
            });

        }
    };

    ko.bindingHandlers.aceEditor = {
        init: function(element, valueAccessor, allBindings, viewModel, bindingContext){

            var value = valueAccessor();
            var valueUnwrapped = ko.unwrap(value);

            var aceEditorText = allBindings.get('aceEditorText');
            var aceEditorTheme = allBindings.get('aceEditorTheme');   // e.g. 'ace/theme/github'
            var aceEditorLanguage = allBindings.get('aceEditorLanguage');   // e.g. 'ace/mode/json'

            var queryEditor = ace.edit(element);
            queryEditor.setTheme(aceEditorTheme ? aceEditorTheme : "ace/theme/github");
            queryEditor.getSession().setMode(aceEditorLanguage ? aceEditorLanguage : "ace/mode/json");

            if (aceEditorText) {

                if (ko.isObservable(aceEditorText)) {
                    aceEditorText.subscribe(function(changedData){

                        var currentValue = queryEditor.getValue();
                        if(_.trim(currentValue) == _.trim(changedData)){
                            return;
                        }

                        queryEditor.setValue(changedData);
                    });
                }

                queryEditor.on("change", function (changedData) {
                    if (ko.isObservable(aceEditorText)) {
                        aceEditorText(queryEditor.getValue());
                    }
                });

            }
        }
    };    

    ko.bindingHandlers.bootstrapChecked = {
        init: function (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
            var value = valueAccessor();
            var newValueAccessor = function () {
                return {
                    change: function () {
                        value(element.value);
                    }
                }
            };
            if ($(element).val() == ko.unwrap(valueAccessor())) {
                $(element).closest('.btn').button('toggle');
            }
            ko.bindingHandlers.event.init(element, newValueAccessor, allBindingsAccessor, viewModel, bindingContext);
        }
}
    
    return {
        bootstrapDatePicker: ko.bindingHandlers.bootstrapDatePicker,
        bootstrapPopover: ko.bindingHandlers.bootstrapPopover,
        typeahead: ko.bindingHandlers.typeahead,
        aceEditor: ko.bindingHandlers.aceEditor 
    };

})();

console.log("[KnockoutCustomBindings]", koCustomBindings);
