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
// Companion to ExportDocTextVariablesToJson.jsx — imports only
// VariableTypes.CUSTOM_TEXT_TYPE rows (see Adobe VariableTypes docs).
// Parses file with $$.JSON.eval (reciprocal of $$.JSON / lave).
// =============================================================================
try
{
	if (app.documents.length === 0) {
		$$.error(__("No active document."));
	}

	var doc = app.activeDocument;
	var file = File.openDialog("Open JSON file", "*.json");

	if (!file) {
		$$.error(__("No file selected."));
	}

	var jsonString = $$.File.readUTF8(file);
	if (!jsonString) {
		$$.error(__("Unable to read the file."));
	}

	var data = $$.JSON.eval(jsonString);
	if (!data || !(data instanceof Array)) {
		$$.error(__("Invalid data: expected an array."));
	}

	var CUSTOM = VariableTypes.CUSTOM_TEXT_TYPE;
	var nCreated = 0;
	var nUpdated = 0;
	var nSkipped = 0;
	var nIgnoredOtherType = 0;

	for (var i = 0; i < data.length; i++) {
		var row = data[i];
		if (!row || typeof row !== "object") {
			nSkipped++;
			continue;
		}

		var rowType = row.type;
		if (rowType !== CUSTOM && +rowType !== +CUSTOM) {
			nIgnoredOtherType++;
			continue;
		}

		var name = row.name;
		if (typeof name !== "string" || name.length === 0) {
			nSkipped++;
			continue;
		}

		var props = row.properties;
		if (!props || typeof props !== "object" || !props.hasOwnProperty("contents")) {
			nSkipped++;
			continue;
		}

		var contents = props.contents;
		if (typeof contents !== "string") {
			nSkipped++;
			continue;
		}

		try {
			var existing = doc.textVariables.itemByName(name);
			if (existing.isValid) {
				var vt = existing.variableType;
				if (vt !== CUSTOM && +vt !== +CUSTOM) {
					(+$$.warn) && $$.warn(__("Skipped %1: existing variable is not custom text.", name));
					nSkipped++;
					continue;
				}
				existing.variableOptions.contents = contents;
				nUpdated++;
			} else {
				var v = doc.textVariables.add({
					name: name,
					variableType: CUSTOM
				});
				v.variableOptions.contents = contents;
				nCreated++;
			}
		} catch (e) {
			(+$$.warn) && $$.warn(__("Import row %1 (%2): %3", String(i), name, e.toString()));
			nSkipped++;
		}
	}

	var parts = [
		__("Created: %1.", nCreated),
		__("Updated: %1.", nUpdated),
		__("Skipped: %1.", nSkipped),
		__("Ignored (non-custom): %1.", nIgnoredOtherType)
	];
	$$.success(__("Import complete.") + " " + parts.join(" "));
}
catch (e)
{
	$$.receiveError(e);
}
// =============================================================================


// Please, unload the framework to cleanup memory.
// (Good practice in engine-persistent scripts!)
// ---
$$.unload();
