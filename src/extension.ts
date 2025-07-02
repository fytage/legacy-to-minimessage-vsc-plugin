import * as vscode from 'vscode';

let isProgrammaticChange = false;

function minimessageToLegacy(text: string, char: string): string {
    let legacy = text.replace(/[\r\n]+/g, " ").trim();

    legacy = legacy.replace(/<#[0-9a-fA-F]{6}>/g, match => {
        return `${char}#${match.slice(2, -1).toUpperCase()}`;
    });

    const tagMap: Record<string, string> = {
        "<b>": char + "l", "<bold>": char + "l",
        "<i>": char + "o", "<italic>": char + "o",
        "<u>": char + "n", "<underlined>": char + "n",
        "<st>": char + "m", "<strikethrough>": char + "m",
        "<obf>": char + "k", "<obfuscated>": char + "k",
        "<r>": char + "r", "<reset>": char + "r"
    };
    for (const [tag, code] of Object.entries(tagMap)) {
        legacy = legacy.replace(new RegExp(tag, "gi"), code);
    }

    const colorMap: Record<string, string> = {
        "<black>": "0", "<dark_blue>": "1", "<dark_green>": "2", "<dark_aqua>": "3",
        "<dark_red>": "4", "<dark_purple>": "5", "<gold>": "6", "<gray>": "7",
        "<dark_gray>": "8", "<blue>": "9", "<green>": "a", "<aqua>": "b",
        "<red>": "c", "<light_purple>": "d", "<yellow>": "e", "<white>": "f"
    };
    for (const [tag, code] of Object.entries(colorMap)) {
        legacy = legacy.replace(new RegExp(tag, "gi"), char + code);
    }

    return legacy;
}

function convert(legacy: string, concise: boolean, char: string, rgb: boolean, removeNewlines: boolean, config: vscode.WorkspaceConfiguration): string {
    let miniMessage = removeNewlines ? legacy.replace(/[\r\n]+/g, " ").trim() : legacy;

    const aliases = (config?.get<Record<string, string>>("colorAliases")) ?? {};
    for (const [key, val] of Object.entries(aliases)) {
        miniMessage = miniMessage.replace(new RegExp(`<${key}>`, "gi"), `<${val}>`);
    }

    const hexFormat = new RegExp(`${char}x(${char}[0-9a-fA-F]){6}`, "gi");
    miniMessage = miniMessage.replace(hexFormat, match => {
        const hex = match.split(char).slice(1).map(s => s.toLowerCase()).join("").replace(/^x/, "");
        return `<#${hex}>`;
    });

    miniMessage = miniMessage
        .replaceAll(char + "0", "<black>").replaceAll(char + "1", "<dark_blue>")
        .replaceAll(char + "2", "<dark_green>").replaceAll(char + "3", "<dark_aqua>")
        .replaceAll(char + "4", "<dark_red>").replaceAll(char + "5", "<dark_purple>")
        .replaceAll(char + "6", "<gold>").replaceAll(char + "7", "<gray>")
        .replaceAll(char + "8", "<dark_gray>").replaceAll(char + "9", "<blue>")
        .replaceAll(char + "a", "<green>").replaceAll(char + "b", "<aqua>")
        .replaceAll(char + "c", "<red>").replaceAll(char + "d", "<light_purple>")
        .replaceAll(char + "e", "<yellow>").replaceAll(char + "f", "<white>");

    if (concise) {
        miniMessage = miniMessage
            .replaceAll(char + "n", "<u>").replaceAll(char + "m", "<st>")
            .replaceAll(char + "k", "<obf>").replaceAll(char + "o", "<i>")
            .replaceAll(char + "l", "<b>").replaceAll(char + "r", "<r>");
    } else {
        miniMessage = miniMessage
            .replaceAll(char + "n", "<underlined>").replaceAll(char + "m", "<strikethrough>")
            .replaceAll(char + "k", "<obfuscated>").replaceAll(char + "o", "<italic>")
            .replaceAll(char + "l", "<bold>").replaceAll(char + "r", "<reset>");
    }

    if (rgb) {
        miniMessage = miniMessage.replace(new RegExp(char + "#([0-9a-fA-F]{6})", "g"), "<#$1>");
    }

    return miniMessage;
}

function stripColors(text: string): string {
    const isLegacy = /([&§][0-9a-fk-orx#])/i.test(text);
    const isMiniMessage = /<([a-zA-Z0-9_#]+)>/i.test(text);

    let stripped = text;

    if (isLegacy && !isMiniMessage) {
        stripped = stripped.replace(/([&§])[0-9a-f]/gi, "");
        stripped = stripped.replace(/([&§])#([0-9a-fA-F]{6})/gi, "");
        stripped = stripped.replace(/([&§])x([&§][0-9a-fA-F]){6}/gi, "");
    } else {
        stripped = stripped.replace(/<#[0-9a-fA-F]{6}>/gi, "");
        const colorNames = [
            "black", "dark_blue", "dark_green", "dark_aqua", "dark_red", "dark_purple",
            "gold", "gray", "dark_gray", "blue", "green", "aqua", "red",
            "light_purple", "yellow", "white"
        ];
        const colorTagRegex = new RegExp(`</?(${colorNames.join('|')})>`, "gi");
        stripped = stripped.replace(colorTagRegex, "");
    }

    return stripped;
}

export function activate(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('legacyToMiniMessage');

    const disposable = vscode.commands.registerCommand('legacy-to-minimessage.convert', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const concise = config.get<boolean>("concise") ?? false;
        const rgb = config.get<boolean>("rgb") ?? true;
        const supportBoth = config.get<boolean>("supportBothChars") ?? false;
        const char = config.get<string>("formatChar") ?? "&";
        const removeNewlinesSetting = config.get<boolean>("removeNewlines") ?? false;

        let removeNewlines = false;
        if (removeNewlinesSetting) {
            const answer = await vscode.window.showQuickPick(["Yes", "No"], {
                placeHolder: "Remove newlines and flatten text into one line?"
            });
            removeNewlines = (answer === "Yes");
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);

        let result: string;
        if (supportBoth) {
            result = convert(convert(text, concise, "&", rgb, removeNewlines, config), concise, "§", rgb, removeNewlines, config);
        } else {
            result = convert(text, concise, char, rgb, removeNewlines, config);
        }

        editor.edit(editBuilder => {
            editBuilder.replace(selection, result);
        });
    });

    const reverseDisposable = vscode.commands.registerCommand('minimessage-to-legacy.convert', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const legacyChar = config.get<string>("formatChar") ?? "&";
        const selection = editor.selection;
        const text = editor.document.getText(selection);

        const result = minimessageToLegacy(text, legacyChar);
        isProgrammaticChange = true;
        editor.edit(editBuilder => {
            editBuilder.replace(selection, result);
        }).then(() => {
            isProgrammaticChange = false;
        });
    });

    const stripColorsDisposable = vscode.commands.registerCommand('legacy-to-minimessage.stripColors', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const selection = editor.selection;
        const text = editor.document.getText(selection);
        const result = stripColors(text);

        isProgrammaticChange = true;
        editor.edit(editBuilder => {
            editBuilder.replace(selection, result);
        }).then(() => {
            isProgrammaticChange = false;
        });
    });
    
    const pasteWatcher = vscode.workspace.onDidChangeTextDocument(event => {
        if (isProgrammaticChange || !vscode.window.activeTextEditor) { return; }
        
        const currentConfig = vscode.workspace.getConfiguration('legacyToMiniMessage');
        if (!currentConfig.get<boolean>("autoConvertOnPaste")) { return; }

        const editor = vscode.window.activeTextEditor;
        if (event.document !== editor.document) { return; }

        const lastChange = event.contentChanges[event.contentChanges.length - 1];
        if (!lastChange || event.reason === vscode.TextDocumentChangeReason.Undo || event.reason === vscode.TextDocumentChangeReason.Redo) {
            return;
        }

        if (!lastChange.text.match(/([&§][0-9a-fk-orx#])/i)) {
            return;
        }

        const concise = currentConfig.get<boolean>("concise") ?? false;
        const rgb = currentConfig.get<boolean>("rgb") ?? true;
        const supportBoth = currentConfig.get<boolean>("supportBothChars") ?? false;
        const char = currentConfig.get<string>("formatChar") ?? "&";

        let result: string;
        if (supportBoth) {
            result = convert(convert(lastChange.text, concise, "&", rgb, false, currentConfig), concise, "§", rgb, false, currentConfig);
        } else {
            result = convert(lastChange.text, concise, char, rgb, false, currentConfig);
        }

        if (result !== lastChange.text) {
            const start = lastChange.range.start;
            const end = editor.document.positionAt(editor.document.offsetAt(start) + lastChange.text.length);
            const replaceRange = new vscode.Range(start, end);

            isProgrammaticChange = true;
            editor.edit(editBuilder => {
                editBuilder.replace(replaceRange, result);
            }, { undoStopBefore: true, undoStopAfter: true }).then(() => {
                isProgrammaticChange = false;
            });
        }
    });

    context.subscriptions.push(disposable, reverseDisposable, stripColorsDisposable, pasteWatcher);
}

export function deactivate() {}
