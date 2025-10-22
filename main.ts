import { Notice, Plugin, TFile } from 'obsidian';
import { spawn } from 'child_process';

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

    private invokePandoc(inputPath: string, outputPath: string) {
        const args = [
            `${inputPath}`,
            '--from=markdown+raw_tex+tex_math_dollars+mark',
            '--pdf-engine=xelatex',
            '-o',
            `${outputPath}`
        ]

        const pandoc = spawn('pandoc', args);

        pandoc.stdout.on('data', (data) => {
            new Notice(`Pandoc: ${data}`);
        });

        pandoc.stderr.on('data', (data) => {
            new Notice(`Pandoc error: ${data}`);
        });

        pandoc.on('close', (code) => {
            if (code === 0) {
                new Notice(`Pandoc conversion complete: ${outputPath}`);
            } else {
                new Notice(`Pandoc exited with code ${code}`);
            }
        });
    }

    // main logic
    private async convertActiveFile() {
        let activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file to copy.');
            return;
        }

        const fileContents = await this.app.vault.read(activeFile);

        let [modifiedFileContents, headingsTree] = this.buildHeadingLabels(fileContents, activeFile);
        
        modifiedFileContents = this.convertRefs(modifiedFileContents, activeFile, headingsTree)

        modifiedFileContents = this.processMaths(modifiedFileContents);

        const header = this.buildHeader(activeFile.name.slice(0, -3));

        modifiedFileContents = header + modifiedFileContents;

        modifiedFileContents = this.cleanUpFile(modifiedFileContents);

        // const appendix = this.buildAppendix(activeFile);

        activeFile = await this.writeToFile(modifiedFileContents);

        const inputPath = (this.app.vault.adapter as any).getFullPath(activeFile.path);
        const outputPath = inputPath.replace(/\.md$/, '.pdf');
        this.invokePandoc(inputPath, outputPath);
    }

    private async writeToFile(content: string): Promise<TFile> {
        let newFile = this.app.vault.getFileByPath('_temp/temp.md');

        if (newFile) {
            await this.app.vault.modify(newFile, content);
        } else {
            newFile = await this.app.vault.create('_temp/temp.md', content);
        }

        return newFile;
    }

    private processMaths(content: string): string {
        content = this.convertEquationLabels(content)
        content = this.convertMath(content);

        // content = this.convertRefs(content);

        // content = this.cleanUpFile(content);

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
        content = content.replace(/\\begin\{multline\}/g, '\\begin{multlined}');
        content = content.replace(/\\end\{multline\}/g, '\\end{multlined}'); 
        content = content.replace(/\\begin\{gather\}/g, '\\begin{gathered}');
        content = content.replace(/\\end\{gather\}/g, '\\end{gathered}'); 

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

                lines[posLastOpen] += ` \\label{${this.sanitize(label)}}`;
                lines[i] = '';
            }
        }

        return lines.join('\n');
    }

    private convertRefs(content: string, file: TFile, headingsTree: string[]): string {
        // convert references to equations
        // content = content.replace(/\[\[#\^([A-Za-z0-9-]+)\]\]/g, (_match, label: string) => `\\cref{${this.sanitize(label)}}`);

        var links = this.app.metadataCache.getFileCache(file)?.links || [];

        // delte links to other files, that is links that don't start with #
        // links to the current file, but of the format [[file#Heading]] are treated as
        // external links for simplicity
        var linkTexts = links.map(link => {
            return link.link.startsWith('#') ? link.link : ''
        });

        // delete empty strings
        linkTexts = linkTexts.filter(s => s !== '');

        // delete duplicates
        linkTexts = [...new Set(linkTexts)];

        // assume headings and headingsTree is synchronized properly
        const headings = this.app.metadataCache.getFileCache(file)?.headings?.map(h => h.heading) || [];

        for (const link of linkTexts) {
            // equations are treated differently from headings
            if (link.startsWith('#^')) {
                // replaceAll is not available on some TS lib targets; use split/join instead
                content = content.split(`[[${link}]]`).join(`\\cref{${this.sanitize(link.slice(2))}}`);
                continue;
            }

            // the following breaks if any # are present in the heading name, but I shouldn't
            // do this anyway, so idc

            // the first element is always empty
            const dissected = link.split('#').slice(1);
            var headingIndex = 0;
            for (const subHead of dissected) {
                // ensure to skip subheadings with the same name which occur before the main heading
                headingIndex = headings.indexOf(subHead, headingIndex);
            }
            content = content.split(`[[${link}]]`).join(`\\cref{${headingsTree[headingIndex]}}`)
        }

        return content;
    }

    private buildHeader(title: string): string {
        return `
---
title: "${title}"
numbersections: true
colorlinks: true
geometry:
  - top=20mm
  - left=30mm
papersize: a4
header-includes:
  - \\usepackage{amsmath}
  - \\usepackage{amssymb}
  - \\usepackage{mathtools}
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
        content = content.replace(/\n+(#{1,6}[^\n]+)/gm, '\n\n$1');

        return content;
    }

    private buildHeadingLabels(content: string, file: TFile): [string, string[]] {
        const headings = this.app.metadataCache.getFileCache(file)?.headings || [];

        const headingStack: string[] = [];

        // first construct the labels
        const headingLabels = headings.map(h => {
            // deal with nested headings that skip heading levels
            // The nested headings
            // # H1
            // ### H2
            // get converted to ['H1', 'H2', 'H2']
            // and if the file starts with, e.g.
            // ### H
            // it gets converted to ['H', 'H', 'H']
            while (headingStack.length < h.level) {
                headingStack.push(h.heading);
            }
            while (headingStack.length > h.level) {
                headingStack.pop();
            }

            // ensure the current heading is always on top of stack, s.t.
            // # H1
            // # H2
            // gets converted correctly to ['H1', 'H2']
            headingStack.pop()
            headingStack.push(h.heading);

            return this.slugifyNestedHeading(headingStack);
        });

        // then insert the labels
        var lines = content.split('\n');

        for (var i = 0; i < headings.length; i++) {
            // we modified lines already, so add i
            // + 1 since we want to insert it after the heading
            lines.splice(headings[i].position.start.line + i + 1, 0, `\\label{${headingLabels[i]}}`)
        }

        return [lines.join('\n'), headingLabels];
    }

    private slugifyNestedHeading(headings: string[]): string {
        let slugifiedHeading = '';

        // leaves trailing colon, which doesn't matter
        for (const h of headings) {
            slugifiedHeading += this.sanitize(h) + ':'
        }

        return slugifiedHeading;
    }

    private sanitize(str: string): string {
        return str.replace(/[^A-Za-z0-9:_-]/g, '_');
    }


    // build and return the appendix
    // TODO: maybe implement this at some point. But right now I can't be fucked.
    private buildAppendix(file: TFile): string {
        /*
            An idea on how to implement this well:
            - before the whole internal link handling is applied, add the appendix into the file, increase the level of each heading
            by one (except of course ###### -> ######), so that they all are under # Appendix. Maybe even create a second level with 
            the notes name, so that all internal headings are increased by two.
            - Then, all external links of the original file are adapted
            - However: how to deal with the links of the appended files?
            - References should be treated differently, however

        */
        const links = this.app.metadataCache.getFileCache(file)?.links || [];
        // for (const link of links) {
        //     new Notice(link.link);
        // }

        let appendix = '\n\\newpage\n# Appendix\n';

        // delete duplicates
        const linkTexts = [...new Set(links.map(item => item.link))];


        var targetList = linkTexts.map(item => {
            const dissected = item.split('#');
            const file = dissected[0];
            const section = dissected.length > 1 ? dissected.slice(1).join('#') : '';
            return [file, section];
        });


        for (const target of targetList) {
            if (target[0] !== '') {
                // appendix += '\n\\newpage\n' + this.retrieveSection(target[0], target[1]);
            }
        }

        // const secs = this.app.metadataCache.getFileCache(file)?.sections || [];

        // for (const sec of secs) {
        //     new Notice(sec.type);
        // }

        return '';
    }
}

