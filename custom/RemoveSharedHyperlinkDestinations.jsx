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
// Based on Gilbert Consulting "Remove shared destinations" script.
// See: https://www.gilbertconsulting.com/scripts
// See: https://www.gilbertconsulting.com/scripts/indesign/remove_shared_destinations.zip
// ---
// Dry-run: build a plain-data list, $$.JSON preview, confirm, optional temp file before apply confirm.
// Apply: same DOM loop inside app.doScript(..., UndoModes.ENTIRE_SCRIPT) for one undo.
// See: https://www.indesignjs.de/extendscriptAPI/indesign-latest for latest
// docs for extendscript API for latest InDesign version.
// =============================================================================

var DIALOG_TITLE = "RemoveSharedHyperlinkDestinations";

// If pretty JSON is longer than this, offer opening full text in a temp file before apply confirm.
// ---
var PREVIEW_LEN_THRESHOLD = 800;

function createCandidate(h) {
	var source = h.source;

	switch (source.constructor.name) {
		case 'HyperlinkTextSource':
			// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkTextSource/
			// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkURLDestination/
			// ---
			return {
				hyperlink: h,
				index: h.index,
				name: h.name,
				label: h.label,
				destination: h.destination,
				// destinationName: h.destination.name,
				// destinationLabel: h.destination.label,
				// destinationURL: h.destination.destinationURL,
				sourceKind: 'HyperlinkTextSource',
				source: source, // InDesign (probably) doesn't clean these up if a hyperlink is removed.
				hidden: h.destination.hidden,
				bad: false,
				toString: (function () { return '<' + this.name + '> (' + this.label + ') -> ' + this.destination.destinationURL; }).bind(this)
			};
		// case 'CrossReferenceSource':
		// 	// See: https://developer.adobe.com/indesign/dom/api/c/CrossReferenceSource/
		// 	// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkTextDestination/
		// 	// ---
		// 	return {
		// 		hyperlink: h,
		// 		index: h.index,
		// 		name: h.name,
		// 		label: h.label,
		// 		destination: h.destination,
		// 		// destinationName: h.destination.name,
		// 		// destinationLabel: h.destination.label,
		// 		// destinationText: h.destination.destinationText.contents,
		// 		sourceKind: 'CrossReferenceSource',
		// 		source, // InDesign (probably) doesn't clean these up if a hyperlink is removed.
		// 		hidden: h.destination.hidden,
		// 		bad: false,
		// 		toString: (function () { return '<' + this.name + '> (' + this.label + ') -> ' + this.destination.destinationText.contents; }).bind(this)
		// 	};
		case 'HyperlinkPageItemSource':
			// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkExternalPageDestination/
			// See: https://developer.mozilla.org/en-US/docs/Web/API/File/File
			//   (documentPath's File object ~ might not be a complete match in terms
			//   of implementation)
			// ---
			if (h.destination.constructor.name === 'HyperlinkExternalPageDestination') {
				return {
					hyperlink: h,
					index: h.index,
					name: h.name,
					label: h.label,
					destination: h.destination,
					// destinationName: h.destination.name,
					// destinationLabel: h.destination.label,
					// documentPath: h.destination.documentPath.name,
					// destinationPageIndex: h.destination.destinationPageIndex,
					// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkDestinationPageSetting/
					// ---
					// viewSetting: h.destination.viewSetting, // Enum
					sourceKind: 'HyperlinkPageItemSource',
					source: source,
					hidden: h.destination.hidden,
					external: true,
					bad: false,
					toString: function () { return '<' + this.name + '> (' + this.label + ') -> ' + this.destination.documentPath.name + ' (page ' + this.destination.destinationPageIndex + ')'; }
				};
			} else {
				// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkPageDestination/
				// ---
				return {
					hyperlink: h,
					index: h.index,
					name: h.name,
					label: h.label,
					destination: h.destination,
					// destinationName: h.destination.name,
					// destinationLabel: h.destination.label,
					// destinationPageIndex: h.destination.destinationPage.index,
					sourceKind: 'HyperlinkPageItemSource',
					source: source, // InDesign (probably) doesn't clean these up if a hyperlink is removed.
					hidden: h.destination.hidden,
					external: false,
					bad: false,
					toString: function () { return '<' + this.name + '> (' + this.label + ') -> page ' + this.destination.destinationPage.index; }
				};
			}
		default:
			throw new Error('Unhandled source kind: ' + h.source.constructor.name);
	}
}

function collectCandidates(doc) {
	var shared = [];
	var hidden = [];
	var bad = [];

	// See: https://developer.adobe.com/indesign/dom/api/d/Document/
	// ---
	var n = doc.hyperlinks.count();

	for (var i = 0; i < n; i++) {
		// See: https://developer.adobe.com/indesign/dom/api/h/Hyperlinks/
		// ---
		var h = doc.hyperlinks[i];
		try {
			// See: https://developer.adobe.com/indesign/dom/api/h/Hyperlink/
			// ---
			if (h.destination.hidden == false) {
				shared.push(createCandidate(h));
			} else {
				hidden.push(createCandidate(h));
			}
		} catch (e) {
			bad.push({
				hyperlink: h,
				bad: true,
				error: e.message ? e.message : '(unknown error)',
				toString: function () { return 'Type error -> ' + (this.error ? this.error : '(unknown error)'); }
			});
		}
	}
	
	return {
		countTotal: n,
		bad: bad,
		shared: shared,
		hidden: hidden
	};
}

// =============================================================================
// applyRemoveSharedDestinationsFromCandidates
// ---
// Replaces the hyperlinks with new ones that go to hidden (unshared)
// destinations.
// ---
// THE OLD destinations are not removed.
// =============================================================================
function applyRemoveSharedDestinationsFromCandidates(doc, candidates) {
	var fixed = 0;
	var bad = candidates.bad.length;

	var errors = [];

	for (var i = 0; i < candidates.bad.length; i++) {
		errors.push(candidates.bad[i].error);
	}

	for (var i = 0; i < candidates.shared.length; i++) {
		var c = candidates.shared[i];
		var newDest;

		try {
			// See: https://developer.adobe.com/indesign/dom/api/d/Document/
			// ---
			if (c.sourceKind === 'HyperlinkTextSource') {
				// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkURLDestinations/
				// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkURLDestination/
				// ---
				newDest = doc.hyperlinkURLDestinations.add(
					c.destination.destinationURL, {
						hidden: true
					});
			} else if (c.sourceKind === 'HyperlinkPageItemSource') {
				if (c.external) {
					// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkExternalPageDestinations/
					// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkExternalPageDestination/
					// ---
					newDest = doc.hyperlinkExternalPageDestinations.add(
						void 0,
						{
							hidden: true,
							documentPath: c.destination.documentPath,
							destinationPageIndex: c.destination.destinationPageIndex,
							viewSetting: c.destination.viewSetting
					  }
					);
				} else {
					// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkPageDestinations/
					// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkPageDestination/
					// ---
					newDest = doc.hyperlinkPageDestinations.add(
						c.destination.destinationPage, {
							hidden: true
						});
				}
			}

			c.hyperlink.destination = newDest;
			
			fixed++;
		} catch (e2) {
			errors.push('Failed to remove hyperlink: ' + (e2.message || '(unknown error)'));

			bad++;
		}
	}
	return { fixed: fixed, bad: bad, errors: errors };
}

try {
	if (app.documents.length === 0) {
		$$.error(__("No active document."));
	}

	var doc = app.activeDocument;
	var candidates = collectCandidates(doc);

	if (candidates.shared.length === 0 && candidates.bad.length === 0) {
		$$.success(__("No shared hyperlink destinations to convert."));
	} else if (candidates.shared.length === 0) {
		var errors = [];

		for (var i = 0; i < candidates.bad.length; i++) {
			errors.push(candidates.bad[i].error);
		}

		$$.error(__("No valid shared hyperlink destinations to convert. Broken or invalid (skipped): %1. Errors: %2.",
			String(candidates.bad.length),
			errors.join($$.newLine)));
	} else {
		var candidatesPreview = [];
		for (var i = 0; i < candidates.shared.length; i++) {
			candidatesPreview.push({
				link: candidates.shared[i].toString(),
				sourceKind: candidates.shared[i].sourceKind
			});
		}
		var jsonPreview = $$.JSON(candidatesPreview, 1);

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
			"About to convert %1 hyperlink(s) from shared to hidden destinations. Proceed?",
			String(candidates.shared.length)
		);

		if (confirm(askApply, false, DIALOG_TITLE)) {
			var outcome = { fixed: 0, bad: 0, errors: [] };
			app.doScript(
				function () {
					var r = applyRemoveSharedDestinationsFromCandidates(doc, candidates);
					outcome.fixed = r.fixed;
					outcome.bad = r.bad;
					outcome.errors = r.errors;
				},
				void 0,
				void 0,
				+UndoModes.ENTIRE_SCRIPT,
				__("Remove shared hyperlink destinations")
			);

			$$.success(
				__("Done. Fixed: %1. Broken or invalid (skipped): %2. Errors: %3.",
					String(outcome.fixed),
					String(outcome.bad),
					outcome.errors.join($$.newLine)),
			);
		}
		// User declined: silent exit, document unchanged.
	}
} catch (e) {
	$$.receiveError(e);
}
// =============================================================================

$$.unload();
