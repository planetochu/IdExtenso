// IdExtenso wants to run in INDD.
// ---
#target 'indesign'

// Path to IdExtenso entry point.
// ---
#include '../$$.jsxinc'

// Dom.Dialog for pattern, replacement, capture group, and flags.
// ---
#include '../etc/$$.Dom.Dialog.jsxlib'

// Load the framework (full init for Dom.Dialog).
// ---
$$.load();

// =============================================================================
// RegexReplaceHyperlinkURLDestinations
// ---
// Find/replace on every HyperlinkURLDestination.destinationURL in the active
// document (one shared destination update applies to all hyperlinks using it).
// Preview with $$.JSON, optional temp file for long previews, single undo via
// app.doScript(..., UndoModes.ENTIRE_SCRIPT).
//
// Modes:
// - Capture group empty: String.replace(re, replaceWith) — $1, $2, … in replace.
// - Capture group = n (1-based): only the text of capturing group n is replaced
//   by the replace string (literal; no $ expansion in that mode).
// =============================================================================

var DIALOG_TITLE = __("RegexReplaceHyperlinkURLDestinations");

// If pretty JSON is longer than this, offer opening full text in a temp file before apply confirm.
// ---
var PREVIEW_LEN_THRESHOLD = 800;

/** @param groupIndex 1-based, or null for standard replace */
function applyReplacement(before, re, replacement, groupIndex) {
	if (groupIndex === null) {
		return before.replace(re, replacement);
	}

	return before.replace(re, function (match) {
		var groupText = arguments[groupIndex];
		if (groupText === undefined || groupText === null) {
			return match;
		}

		var g = String(groupText);

		if (!g.length) {
			return match;
		}

		var rel = match.indexOf(g);

		if (rel < 0) {
			return match;
		}

		return match.slice(0, rel) + replacement + match.slice(rel + g.length);
	});
}

function validateGroupIndexAgainstPattern(re, groupIndex, doc) {
	if (groupIndex === null) {
		return;
	}

	var n = doc.hyperlinkURLDestinations.count();
	var i;
	var u;
	var m;

	for (i = 0; i < n; i++) {
		u = String(doc.hyperlinkURLDestinations[i].destinationURL);
		re.lastIndex = 0;
		m = re.exec(u);

		if (m) {
			re.lastIndex = 0;

			if (m[groupIndex] === undefined) {
				$$.error(
					__(
						"Capture group %1 is not present in the first matching URL (pattern has too few groups for that match).",
						String(groupIndex)
					)
				);
			}

			return;
		}
	}

	re.lastIndex = 0;
}

function collectUrlDestinationPreview(doc, re, replacement, groupIndex) {
	var out = [];
	var n = doc.hyperlinkURLDestinations.count();

	for (var i = 0; i < n; i++) {
		var dest = doc.hyperlinkURLDestinations[i];
		var before = String(dest.destinationURL);
		var after = applyReplacement(before, re, replacement, groupIndex);

		if (after !== before) {
			out.push({
				name: dest.name,
				label: dest.label,
				hidden: dest.hidden,
				before: before,
				after: after
			});
		}
	}

	return out;
}

function applyUrlDestinationReplacements(doc, re, replacement, groupIndex) {
	var updated = 0;
	var errors = [];
	var n = doc.hyperlinkURLDestinations.count();

	for (var i = 0; i < n; i++) {
		var dest = doc.hyperlinkURLDestinations[i];

		try {
			var before = String(dest.destinationURL);
			var after = applyReplacement(before, re, replacement, groupIndex);

			if (after !== before) {
				dest.destinationURL = after;
				updated++;
			}
		} catch (e) {
			errors.push(
				String(dest.name)
				+ " ("
				+ String(dest.label)
				+ "): "
				+ (e.message ? e.message : e.toString() ? e.toString() : "(unknown error)")
			);
		}
	}

	return { updated: updated, errors: errors };
}

try {
	if (app.documents.length === 0) {
		$$.error(__("No active document."));
	}

	var doc = app.activeDocument;

	if (doc.hyperlinkURLDestinations.count() === 0) {
		$$.success(__("No URL hyperlink destinations in this document."));
	} else {
		var _capFind = __("Find (regex)");
		var _capReplace = __("Replace with");
		var _capGroup = __("Capture group");
		var _capFlags = __("Flags");
		var _hintStandard = __(
			'Leave capture group empty for normal replace; in "Replace with" you may use $1, $2, $&, etc.'
		);
		var _hintGroup = __(
			"If capture group is a positive integer (1-based), only that group's text is replaced by the replace string (literal text)."
		);
		var _hintFlags = __(
			"Flags: default is g. Clear flags for a single match per URL."
		);

		var dialogXML =
			<Dialog name={DIALOG_TITLE} canCancel="true" captionWidth="140" editWidth="360">
				<DialogColumn>
					<TextEditbox key="pattern" caption={_capFind} edit="" />
					<TextEditbox key="replacement" caption={_capReplace} edit="" />
					<TextEditbox key="captureGroup" caption={_capGroup} edit="" />
					<TextEditbox key="flags" caption={_capFlags} edit="g" />
					<StaticText caption={_hintStandard} />
					<StaticText caption={_hintGroup} />
					<StaticText caption={_hintFlags} />
				</DialogColumn>
			</Dialog>;

		var dlg = $$.Dom.Dialog(dialogXML);
		dlg.setValueKey("flags", "g");

		if (!dlg.show()) {
			dlg.destroy();
		} else {
			var pattern = String(dlg.getValueKey("pattern") || "");
			var replacement = String(dlg.getValueKey("replacement") || "");
			var capRaw = String(dlg.getValueKey("captureGroup") || "").replace(/^\s+|\s+$/g, "");
			var flags = String(dlg.getValueKey("flags") || "").replace(/^\s+|\s+$/g, "");
			dlg.destroy();

			var groupIndex = null;

			if (capRaw.length) {
				groupIndex = parseInt(capRaw, 10);

				if (isNaN(groupIndex) || groupIndex < 1) {
					$$.error(__("Capture group must be a positive integer or empty."));
				}
			}

			var re;

			try {
				re = new RegExp(pattern, flags);
			} catch (e0) {
				$$.error(
					__("Invalid regular expression: %1.",
						e0.message ? e0.message : e0.toString() ? e0.toString() : "(unknown error)")
				);
			}

			validateGroupIndexAgainstPattern(re, groupIndex, doc);

			var preview = collectUrlDestinationPreview(doc, re, replacement, groupIndex);

			if (preview.length === 0) {
				$$.success(__("No matching URL destinations. Nothing was changed."));
			} else {
				var jsonPreview = $$.JSON(preview, 1);

				if (jsonPreview.length > PREVIEW_LEN_THRESHOLD) {
					var askFile = __(
						"The preview JSON is %1 characters. Open the full preview in a temporary text file?",
						String(jsonPreview.length)
					);

					if (confirm(askFile, false, DIALOG_TITLE)) {
						var prolog = [
							__("Regex replace hyperlink URL destinations — full JSON preview"),
							"---------------------------------------------------------"
						].join($$.newLine) + $$.newLine;

						$$.File.temp(prolog + jsonPreview, "txt", 1);
					}
				}

				var askApply = __(
					"About to update %1 URL destination(s). Proceed?",
					String(preview.length)
				);

				if (confirm(askApply, false, DIALOG_TITLE)) {
					var outcome = { updated: 0, errors: [] };

					app.doScript(
						function () {
							var r = applyUrlDestinationReplacements(doc, re, replacement, groupIndex);
							outcome.updated = r.updated;
							outcome.errors = r.errors;
						},
						void 0,
						void 0,
						+UndoModes.ENTIRE_SCRIPT,
						__("Regex replace hyperlink URL destinations")
					);

					$$.success(
						__("Done. Updated: %1. Errors: %2.",
							String(outcome.updated),
							outcome.errors.length ? outcome.errors.join($$.newLine) : __("None"))
					);
				}
			}
		}
	}
} catch (e) {
	$$.receiveError(e);
}

$$.unload();
