// IdExtenso wants to run in INDD.
// ---
#target 'indesign'

// Path to IdExtenso entry point.
// ---
#include '../$$.jsxinc'

// Load the framework in MUTE log mode.
// ---
$$.load(0);

// =============================================================================
// Based on the AppToJson [170408][CHG180307] example/test script
// ---
// Demonstrates:
// - $$.JSON.lave() routine (just call `$$.JSON(...)`, since it's the auto method.)
// - Some nice options behind it.
// - $$.File.temp() to create an instant temp file and open it in some editor.
// =============================================================================
try
{
	if (app.documents.length === 0) {
		$$.error(__("No active document."));
    }

    var doc = app.activeDocument;
    var vars = doc.textVariables;

    var output = [];

    for (var i = 0; i < vars.length; i++) {
        var v = vars[i];

        var obj = {
            name: v.name,
            type: v.variableType,
            properties: {}
        };

        // See: https://developer.adobe.com/indesign/dom/api/v/VariableTypes/.
        // ---
        try {
            switch (v.variableType) {
                case VariableTypes.CUSTOM_TEXT_TYPE:
                    obj.properties.contents = v.variableOptions.contents;
                    break;

                default:
                    obj.properties.note = "Unsupported or unhandled type";
            }
        } catch (e) {
            obj.properties.error = e.toString();
        }

        output.push(obj);
    }

    var file = File.saveDialog("Save JSON file", "*.json");

	if (!file) {
		$$.error(__("No file selected."));
	};

	var jsonString = $$.JSON(output, 1);

	$$.File.writeUTF8(file, jsonString);

	$$.success("Export complete!");
}
catch(e)
{
	// Just in case something goes wrong.
	// ---
	$$.receiveError(e);
}
// =============================================================================


// Please, unload the framework to cleanup memory.
// (Good practice in engine-persistent scripts!)
// ---
$$.unload();
