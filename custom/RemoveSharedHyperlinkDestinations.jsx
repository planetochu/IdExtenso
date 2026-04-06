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
// See: https://www.indesignjs.de/extendscriptAPI/indesign-latest for
// extendScript API docs for latest InDesign version.
// =============================================================================

var DIALOG_TITLE = "RemoveSharedHyperlinkDestinations";

// If pretty JSON is longer than this, offer opening full text in a temp file before apply confirm.
// ---
var PREVIEW_LEN_THRESHOLD = 800;

function createCandidate(h) {
	try {
		var source = h.source;
		var destination = h.destination;

		var candidate = {
			hyperlink: h,
			index: h.index,
			name: h.name,
			label: h.label,
			hidden: true, // assuming not a shared destination by default
			destinationKind: destination.constructor.name,
			destination: destination,
			sourceKind: source.constructor.name,
			source: source, // InDesign (probably) doesn't clean these up if a hyperlink is removed.
			ignored: false,
			bad: false
		};

		switch (source.constructor.name) {
			// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkTextSource/
			// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkPageItemSource/
			case 'HyperlinkTextSource':
			case 'HyperlinkPageItemSource': {
				switch (destination.constructor.name) {
					case 'HyperlinkURLDestination': {
						// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkURLDestination/
						// ---
						// destinationName: h.destination.name,
						// destinationLabel: h.destination.label,
						// destinationURL: h.destination.destinationURL,

						candidate.hidden = destination.hidden;
						candidate.toString = function () { return '<' 
							+ candidate.name
							+ '> ('
							+ candidate.label
							+ ') -> '
							+ candidate.destination.destinationURL;
						};

						return candidate;
					}
					case 'HyperlinkTextDestination': {
						// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkTextDestination/
						// See: https://developer.mozilla.org/en-US/docs/Web/API/File/File
						// ---
						// destinationName: h.destination.name,
						// destinationLabel: h.destination.label,
						// destinationText: h.destination.destinationText.contents,

						candidate.hidden = destination.hidden;
						candidate.toString = function () { return '<' 
							+ candidate.name
							+ '> ('
							+ candidate.label
							+ ') -> '
							+ candidate.destination.destinationText.contents;
						};
					}
					case 'HyperlinkExternalPageDestination': {
						// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkExternalPageDestination/
						// See: https://developer.mozilla.org/en-US/docs/Web/API/File/File
						//   (documentPath's File object ~ might not be a complete match in terms
						//   of implementation)
						// ---
						// destinationName: h.destination.name,
						// destinationLabel: h.destination.label,
						// documentPath: h.destination.documentPath.name,
						// destinationPageIndex: h.destination.destinationPageIndex,
						// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkDestinationPageSetting/
						// ---
						// viewSetting: h.destination.viewSetting, // Enum

						candidate.ignored = true;
						candidate.hidden = destination.hidden;
						candidate.toString = function () { return '<' 
							+ candidate.name
							+ '> ('
							+ candidate.label
							+ ') -> '
							+ candidate.destination.documentPath.name
							+ ' (page '
							+ candidate.destination.destinationPageIndex
							+ ')';
						};
	
						return candidate;
					}
					case 'HyperlinkPageDestination': {
						// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkPageDestination/
						// ---
						// destinationName: h.destination.name,
						// destinationLabel: h.destination.label,
						// destinationPageIndex: h.destination.destinationPage.index,

						candidate.ignored = true;
						candidate.hidden = destination.hidden;
						candidate.toString = function () { return '<' 
							+ candidate.name
							+ '> ('
							+ candidate.label
							+ ') -> page '
							+ candidate.destination.destinationPage.index;
						};

						return candidate;
					}
					default:
						throw new Error('Unhandled destination kind: ' + h.destination.constructor.name);
				}
			}
			case 'CrossReferenceSource': {
				// See: https://developer.adobe.com/indesign/dom/api/c/CrossReferenceSource/
				// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkTextDestination/
				// ---
				// destinationName: h.destination.name,
				// destinationLabel: h.destination.label,
				// destinationText: h.destination.destinationText.contents,

				candidate.ignored = true;
				candidate.hidden = destination.hidden;
				candidate.toString = function () { return '<' 
					+ candidate.name
					+ '> ('
					+ candidate.label
					+ ') -> '
					+ candidate.destination.destinationText.contents;
				};

				return candidate;
			}
			default:
				throw new Error('Unhandled source or destination kind: '
					+ source.constructor.name
					+ ' -> ' + destination.constructor.name);
		}
	} catch (e) {
		throw new Error('Failed to create candidate for hyperlink.'
			+ ' '
			+ (e.message ? e.message : e.toString() ? e.toString() : '(unknown error)')
		);
	}
}

function collectCandidates(doc) {
	var shared = [];
	var hidden = [];
	var ignored = [];
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
			var c = createCandidate(h);
			if (c.ignored) {
				ignored.push(c);
			} else if (c.hidden) {
				hidden.push(c);
			} else if (!c.hidden) {
				shared.push(c);
			}
		} catch (e) {
			var error = h.name
			 + ' (' + h.label + ')'
			 + ': '
			  + (e.message ? e.message : e.toString() ? e.toString() : '(unknown error)');
			
			bad.push({
				name: h.name,
			  label: h.label,
				bad: true,
				error: error,
				toString: function () { return error }
			});
		}
	}
	
	return {
		countTotal: n,
		shared: shared,
		hidden: hidden,
		ignored: ignored,
		bad: bad,
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
			switch (c.destinationKind) {
				case 'HyperlinkURLDestination': {
					// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkURLDestinations/
					// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkURLDestination/
					// ---
					newDest = doc.hyperlinkURLDestinations.add(
						c.destination.destinationURL, {
							hidden: true
						});

					break;
				}
				case 'HyperlinkExternalPageDestination': {				
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

					break;
				}
				case 'HyperlinkPageDestination': {
					// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkPageDestinations/
					// See: https://developer.adobe.com/indesign/dom/api/h/HyperlinkPageDestination/
					// ---
					newDest = doc.hyperlinkPageDestinations.add(
						c.destination.destinationPage, {
							hidden: true
						});

					break;
				}
				default:
					throw new Error(c.toString()
					  + ': -> Unhandled destination kind: '
						+ c.destinationKind + '.');
			}

			c.hyperlink.remove();
			doc.hyperlinks.add(c.source, newDest);
			
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

	if (candidates.shared.length === 0 && candidates.bad.length === 0 && candidates.ignored.length > 0) {
		$$.success(__("No hyperlink destinations to convert. Cross-reference destinations are ignored."));
	} else if (candidates.shared.length === 0 && candidates.bad.length === 0) {
		$$.success(__("No shared hyperlink destinations to convert."));
	} else if (candidates.shared.length === 0) {
		var errors = [];

		for (var i = 0; i < candidates.bad.length; i++) {
			errors.push(candidates.bad[i].error);
		}

		$$.error(__("No valid shared hyperlink destinations to convert. Broken or invalid: %1. Errors: %2.",
			String(candidates.bad.length),
			errors.join($$.newLine)
		));
	} else {
		var candidatesPreview = [];
		for (var i = 0; i < candidates.shared.length; i++) {
			candidatesPreview.push({
				link: candidates.shared[i].toString(),
				sourceKind: candidates.shared[i].sourceKind,
				destinationKind: candidates.shared[i].destinationKind
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
