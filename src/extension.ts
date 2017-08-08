'use strict';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    vscode.workspace.onDidChangeTextDocument(event => {
        findQuotesToMorph(event);
    });
}

export function deactivate() {
}

const QUOTES = ['\'', '"', '`'];
const LOGGING_ENABLED = false;
const log = (...args) => { if (LOGGING_ENABLED) console.log(args); }

function findQuotesToMorph(event: vscode.TextDocumentChangeEvent) {
    let wrapping = findWrappingSingleCharacterInQuotes(event);
    if (!wrapping) {
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const wrappedStart = wrapping.start.translate(0, wrapping.insertedQuote.length);
    const wrapped = editor.document.getText(new vscode.Range(wrappedStart, wrapping.end));

    if (QUOTES.indexOf(wrapped) == -1) {
        log(`abort - wrapped '${wrapped}' is not a quote`);
        return;
    }

    editor.edit((editBuilder) => {
        const wrappingRange = new vscode.Range(wrapping.start,
            wrapping.end.translate(0, wrapping.insertedQuote.length));
        editBuilder.replace(wrappingRange, wrapping.insertedQuote);
    });
}

function findWrappingSingleCharacterInQuotes(event: vscode.TextDocumentChangeEvent) {
    return detectInsertionOf2QuotesAroundSingleCharacter(event);
}

function detectInsertionOf2QuotesAroundSingleCharacter(event: vscode.TextDocumentChangeEvent) {
    if (event.contentChanges.length != 2) {
        log(`abort - made ${event.contentChanges.length} changes`);
        return;
    }

    const first = event.contentChanges[0];
    const second = event.contentChanges[1];
    if (first.text != second.text) {
        log(`abort - inserted texts do not match`);
        return;
    }

    if (QUOTES.indexOf(first.text) == -1) {
        log(`abort - '${first.text}' is not a quote`);
        return;
    }

    if (first.rangeLength != 0 || second.rangeLength != 0) {
        log(`abort - some text was replaced`);
        return;
    }

    if (first.range.start.line !== second.range.start.line) {
        log(`abort - insertion in multiple lines`);
        return;
    }

    const insertion1 = first.range.start.character;
    const insertion2 = second.range.start.character;

    let wrappedCharacterCount, start, end;
    if (insertion1 > insertion2) {
        wrappedCharacterCount = insertion1 - insertion2;
        start = new vscode.Position(second.range.start.line, insertion2);
        end = new vscode.Position(first.range.start.line, insertion1 + second.text.length);
    } else {
        wrappedCharacterCount = insertion2 - insertion1 - first.text.length;
        start = new vscode.Position(first.range.start.line, insertion1);
        end = new vscode.Position(second.range.start.line, insertion2);
    }

    if (wrappedCharacterCount != 1) {
        log(`abort - wrapped ${wrappedCharacterCount} characters`);
        return;
    }

    const result = {
        insertedQuote: first.text,
        start,
        end
    };

    log(`single character wrapped in quotes ${JSON.stringify(result)}`);
    return result;
}
