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
const log = (...args) => { if (LOGGING_ENABLED) console.log(...args); }

async function findQuotesToMorph(event: vscode.TextDocumentChangeEvent) {
    let wrapping = findWrappingSingleCharacterInQuotes(event);
    if (!wrapping) {
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const wrappedStart = wrapping.opening.translate(0, wrapping.insertedQuote.length);
    const wrapped = editor.document.getText(new vscode.Range(wrappedStart, wrapping.closing));

    if (QUOTES.indexOf(wrapped) == -1) {
        log(`abort - wrapped '${wrapped}' is not a quote`);
        return;
    }

    const line = wrapping.opening.line;
    const wrappingEnd = wrapping.closing.translate(0, wrapping.insertedQuote.length);
    const originalLine =
        editor.document.getText(new vscode.Range(line, 0, line, wrapping.opening.character)) +
        wrapped +
        readLine(editor.document, wrappingEnd);

    const pairedQuote = findPairedWrappingQuote(originalLine, wrapping.opening.character);
    const pairedIsClosing = pairedQuote > wrapping.opening.character;

    const operation = editor.edit((editBuilder) => {
        const wrappingRange = new vscode.Range(wrapping.opening, wrappingEnd);
        editBuilder.replace(wrappingRange, wrapping.insertedQuote);
        if (pairedQuote) {
            const offset = pairedIsClosing ? wrapping.insertedQuote.length * 2 : 0;
            const range = new vscode.Range(line, pairedQuote + offset, line, pairedQuote + offset + 1);
            editBuilder.replace(range, wrapping.insertedQuote);
        }
    });

    if (pairedQuote) {
        await operation;
        editor.selection = new vscode.Selection(wrapping.opening, wrappedStart);
    }
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
        opening: start,
        closing: end
    };

    log(`single character wrapped in quotes ${JSON.stringify(result)}`);
    return result;
}

function readLine(doc: vscode.TextDocument, start: vscode.Position): string {
    const charactersToRead = 1;
    let charactersReceived;
    let result = "";
    do {
        const end = new vscode.Position(start.line, start.character + charactersToRead);
        const chunk = doc.getText(new vscode.Range(start, end));
        charactersReceived = chunk.length;
        result = result + chunk;
        start = end;
    } while (charactersReceived == charactersToRead);
    return result;
}

function findPairedWrappingQuote(text: string, position: number): number {
    let wrappingQuote = null;
    let wrappingStart = null;
    for (let index = 0; index < text.length; index++) {
        if (wrappingQuote) {
            const foundClosingQuote = wrappingQuote == text[index];
            if (index == position) {
                return foundClosingQuote ? wrappingStart : undefined;
            } else if (foundClosingQuote) {
                if (wrappingStart == position) {
                    return index;
                }
                wrappingQuote = null;
                wrappingStart = null;
            }
        } else if (QUOTES.indexOf(text[index]) != -1) {
            wrappingQuote = text[index];
            wrappingStart = index;
        }
    }
    return undefined;
}
