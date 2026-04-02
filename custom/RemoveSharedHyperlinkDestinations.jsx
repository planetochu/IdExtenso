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
// RemoveSharedHyperlinkDestinations
// ---
// Based on Gilbert Consulting "Remove shared destinations" script(temp reference).
// See: https://www.gilbertconsulting.com/scripts/indesign/remove_shared_destinations.zip
// Dry-run: build a plain-data list, $$.JSON preview, confirm, optional temp file
// when JSON length exceeds PREVIEW_LEN_THRESHOLD (see Step C in plan).
// Apply: same DOM loop inside app.doScript(..., UndoModes.ENTIRE_SCRIPT) for one undo.
// =============================================================================

var DIALOG_TITLE = "RemoveSharedHyperlinkDestinations";
// If pretty JSON is longer than this, offer opening full text in a temp file before apply confirm.
// ---
var PREVIEW_LEN_THRESHOLD = 800;

function collectCandidates(doc) {
	var out = [];
	var n = doc.hyperlinks.count();
	for (var i = 0; i < n; i++) {
		var h = doc.hyperlinks[i];
		try {
			if (h.destination.hidden == false) {
				if (h.source.constructor.name != "CrossReferenceSource") {
					out.push({
						hyperlinkName: h.name,
						destinationURL: h.destination.destinationURL,
						sourceKind: h.source.constructor.name
					});
				}
			}
		} catch (e) {
			// Skip — same reads as apply inner path; failures surface as bad in apply.
		}
	}
	return out;
}

function applyRemoveSharedDestinations(doc) {
	var fixed = 0;
	var bad = 0;
	var myNumHyperlinks = doc.hyperlinks.count();
	for (var i = myNumHyperlinks - 1; i >= 0; i--) {
		var myHyperlink = doc.hyperlinks[i];
		try {
			if (myHyperlink.destination.hidden == false) {
				if (myHyperlink.source.constructor.name != "CrossReferenceSource") {
					var myDestURL = myHyperlink.destination.destinationURL;
					var myHyperlinkName = myHyperlink.name;
					var myHyperlinkSource = myHyperlink.source;
					var myCStyle;
					try {
						myCStyle = myHyperlinkSource.sourceText.appliedCharacterStyle;
					} catch (e0) {}
					myHyperlink.remove();
					i++;
					var myNewDestination = doc.hyperlinkURLDestinations.add(myDestURL, { hidden: true });
					var myNewHyperlink = doc.hyperlinks.add(myHyperlinkSource, myNewDestination);
					myNewHyperlink.name = myHyperlinkName;
					try {
						myNewHyperlink.source.sourceText.appliedCharacterStyle = myCStyle;
					} catch (e1) {}
					fixed++;
				}
			}
		} catch (e2) {
			bad++;
		}
	}
	return { fixed: fixed, bad: bad };
}

try {
	if (app.documents.length === 0) {
		$$.error(__("No active document."));
	}

	var doc = app.activeDocument;
	var candidates = collectCandidates(doc);

	if (candidates.length === 0) {
		$$.success(__("No shared URL hyperlink destinations to convert."));
	} else {
		var jsonPreview = $$.JSON(candidates, 1);

		// Long preview: offer temp file before the apply confirm (plan Step C).
		// ---
		if (jsonPreview.length > PREVIEW_LEN_THRESHOLD) {
			var askFile = __(
				"The preview JSON is %1 characters. Open the full preview in a temporary text file?",
				String(jsonPreview.length)
			);
			if (confirm(askFile, false, DIALOG_TITLE)) {
				var prolog = [
					__("Remove shared hyperlink destinations — full JSON preview"),
					"---------------------------------------------------------"
				].join($$.newLine) + $$.newLine;
				$$.File.temp(prolog + jsonPreview, "txt", 1);
			}
		}

		var askApply = __(
			"About to convert %1 hyperlink(s) from shared to hidden URL destinations. Proceed?",
			String(candidates.length)
		);
		
		if (confirm(askApply, false, DIALOG_TITLE)) {
			var outcome = { fixed: 0, bad: 0 };
			app.doScript(
				function () {
					var r = applyRemoveSharedDestinations(doc);
					outcome.fixed = r.fixed;
					outcome.bad = r.bad;
				},
				void 0,
				void 0,
				+UndoModes.ENTIRE_SCRIPT,
				__("Remove shared hyperlink destinations")
			);

			$$.success(
				__("Done. Fixed: %1. Broken or invalid (skipped): %2.", String(outcome.fixed), String(outcome.bad))
			);
		}
		// User declined: silent exit, document unchanged.
	}
} catch (e) {
	$$.receiveError(e);
}
// =============================================================================

$$.unload();
