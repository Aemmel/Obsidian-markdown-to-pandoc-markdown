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

        let fileContents = await this.app.vault.read(activeFile);

        fileContents = this.processContents(fileContents);
        

        new Notice(fileContents);
    }

    private processContents(content: string): string {
        content = this.convertEquationLabelsAndRefs(content)
        content = this.convertMath(content);

        return content;
    }

    // Convert to math that conforms with pandoc better
    private convertMath(content: string): string {
        // Replace paired "$$" markers with LaTeX equation environment wrappers
        let isOpening = true;
        content = content.replace(/\$\$/g, () => {
            const rep = isOpening ? "\\begin{equation}" : "\\end{equation}";
            isOpening = !isOpening;
            return rep;
        });

        content = content.replace(/\\begin\{align\}/g, '\\begin{aligned}');
        content = content.replace(/\\end\{align\}/g, '\\end{aligned}');

        return content;
    }

    
    private convertEquationLabelsAndRefs(content: string): string {



        return content;
    }
}

