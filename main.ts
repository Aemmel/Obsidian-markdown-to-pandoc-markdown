import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// pandoc "temp.md" --from=markdown+raw_tex+tex_math_dollars --citeproc --pdf-engine=xelatex -o "output.pdf"

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

        const header = this.buildHeader();

        fileContents = header + fileContents;

        const newFile = this.app.vault.getFileByPath('_temp/temp.md');

        if (newFile) {
            await this.app.vault.modify(newFile, fileContents);
        } else {
            this.app.vault.create('_temp/temp.md', fileContents);
        }
    }

    private processContents(content: string): string {
        content = this.convertEquationLabels(content)
        content = this.convertMath(content);

        content = this.convertRefs(content);

        content = this.cleanUpFile(content);

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


    // convert $$...$$^label to $$ \label{label} ... $$
    private convertEquationLabels(content: string): string {
        const lines = content.split('\n');

        let posLastOpen = 0;
        let isOpen = false;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i] === '$$') {
                if (!isOpen) {
                    posLastOpen = i;
                }
                isOpen = !isOpen;
            }

            const match = lines[i].match(/^\^([A-Za-z0-9-]+)/);
            if (match && !isOpen) {
                const label = match[1];

                lines[posLastOpen] += ` \\label{${label}}`;
                lines[i] = '';
            }
        }

        return lines.join('\n');
    }

    private convertRefs(content: string): string {
        // convert references to equations
        content = content.replace(/\[\[#\^([A-Za-z0-9-]+)\]\]/g, (_match, label: string) => `\\cref{${label}}`);

        return content;
    }

    private buildHeader(): string {
        return `
---
title: "Test Things"
numbersections: true
colorlinks: true
geometry:
  - top=20mm
  - left=30mm
papersize: a4
header-includes:
  - \\usepackage{amsmath}
  - \\usepackage{amssymb}
  - \\usepackage{physics}
  - \\usepackage[colorlinks]{hyperref}
  - \\usepackage[nameinlink]{cleveref}
---

`;
    }

    private cleanUpFile(content: string): string {
        // replace consecutive newlines
        content = content.replace(/\n{2,}/g, '\n\n');

        // no empty line before and after equation.
        content = content.replace(/\n\n\\begin\{equation\}/g, '\n\\begin\{equation\}')
        content = content.replace(/\\end\{equation\}\n\n/g, '\\end\{equation\}\n')

        // ensure exactly one blank line before each ATX header
        content = content.replace(/\n*(#{1,6}[^\n]+)/gm, '\n\n$1');

        return content;
    }

    // build and return the appendix
    private buildAppendix(content: string): string {

        return "";
    }
}

