import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

export default class MdToPandoc extends Plugin {
    async onload() {
        this.addCommand({
            id: 'convert-active-file-with-pandoc',
            name: 'Convert active file with Pandoc',
            callback: () => {
                void this.convertActiveFile();
            },
        });
    }

    onunload() {
        this.removeCommand('convert-active-file-with-pandoc');
    }

    // main logic
    private async convertActiveFile() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file to copy.');
            return;
        }

        const fileContents = await this.app.vault.read(activeFile);

        new Notice(fileContents);
    }
}

