// IdExtenso wants to run in INDD.
// ---
#target 'indesign'

// Path to IdExtenso entry point.
// ---
#include '../$$.jsxinc'

// Dom.Dialog for pattern, replacement, and flags.
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
// =============================================================================

var DIALOG_TITLE = __("RegexReplaceHyperlinkURLDestinations");

// If pretty JSON is longer than this, offer opening full text in a temp file before apply confirm.
// ---
var PREVIEW_LEN_THRESHOLD = 800;

function collectUrlDestinationPreview(doc, re, replacement) {
	var out = [];
	var n = doc.hyperlinkURLDestinations.count();

	for (var i = 0; i < n; i++) {
		var dest = doc.hyperlinkURLDestinations[i];
		var before = String(dest.destinationURL);
		var after = before.replace(re, replacement);

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

function applyUrlDestinationReplacements(doc, re, replacement) {
	var updated = 0;
	var errors = [];
	var n = doc.hyperlinkURLDestinations.count();

	for (var i = 0; i < n; i++) {
		var dest = doc.hyperlinkURLDestinations[i];

		try {
			var before = String(dest.destinationURL);
			var after = before.replace(re, replacement);

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
		var _capFlags = __("Flags");

		var dialogXML =
			<Dialog name={DIALOG_TITLE} canCancel="true" captionWidth="140" editWidth="360">
				<DialogColumn>
					<TextEditbox key="pattern" caption={_capFind} edit="" />
					<TextEditbox key="replacement" caption={_capReplace} edit="" />
					<TextEditbox key="flags" caption={_capFlags} edit="g" />
				</DialogColumn>
			</Dialog>;

		var dlg = $$.Dom.Dialog(dialogXML);
		dlg.setValueKey("flags", "g");

		if (!dlg.show()) {
			dlg.destroy();
		} else {
			var pattern = String(dlg.getValueKey("pattern") || "");
			var replacement = String(dlg.getValueKey("replacement") || "");
			var flags = String(dlg.getValueKey("flags") || "g");
			dlg.destroy();

			if (!flags.length) {
				flags = "g";
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

			var preview = collectUrlDestinationPreview(doc, re, replacement);

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
							var r = applyUrlDestinationReplacements(doc, re, replacement);
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
