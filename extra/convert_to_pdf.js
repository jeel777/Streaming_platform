import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { marked } from 'marked';
import hljs from 'highlight.js';

const inputMarkdownPath = path.resolve('extra/backend_interview_prep.md');
const outputHtmlPath = path.resolve('extra/backend_interview_prep.html');
const outputPdfPath = path.resolve('extra/backend_interview_prep.pdf');

const markdownContent = fs.readFileSync(inputMarkdownPath, 'utf8');

// Configure marked with syntax highlighting
marked.setOptions({
    highlight: function(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    },
    gfm: true,
    breaks: true
});

const renderer = new marked.Renderer();

renderer.heading = function({ depth, text }) {
    const rawText = text;
    const isQuestion = rawText.includes('❓');
    
    if (depth === 1) {
        return `
        <div class="doc-header">
            <div class="header-badge">Backend System Design & Interview Guide</div>
            <h1 class="main-title">${rawText}</h1>
            <div class="header-meta">
                <span>📚 Architecture Deep Dive</span>
                <span>⚡ Production Patterns</span>
                <span>🛡️ Real Codebase References</span>
            </div>
        </div>
        `;
    }
    
    if (isQuestion) {
        const cleanQuestion = rawText.replace(/❓\s*/g, '').replace(/^"|"$/g, '');
        return `<div class="question-header"><span class="q-badge">Question</span><h4 class="q-title">${cleanQuestion}</h4></div>`;
    }
    
    if (depth === 2) {
        const numMatch = rawText.match(/^(\d+)\.\s*(.*)/);
        if (numMatch) {
            return `<h2 class="section-title"><span class="section-num">${numMatch[1]}</span> ${numMatch[2]}</h2>`;
        }
        return `<h2 class="section-title"><span class="section-num">📌</span> ${rawText}</h2>`;
    }

    if (depth === 3) {
        return `<h3 class="subsection-title">${rawText}</h3>`;
    }
    
    return `<h${depth}>${rawText}</h${depth}>`;
};

renderer.blockquote = function({ text }) {
    if (text.includes('[!TIP]')) {
        const tipContent = text.replace(/\[!TIP\]\s*/g, '').replace(/<p>\s*<\/p>/g, '');
        return `<div class="callout callout-tip"><div class="callout-icon">💡</div><div class="callout-content"><strong>PRO TIP</strong><br/>${tipContent}</div></div>`;
    }
    if (text.includes('[!WARNING]')) {
        const warnContent = text.replace(/\[!WARNING\]\s*/g, '').replace(/<p>\s*<\/p>/g, '');
        return `<div class="callout callout-warning"><div class="callout-icon">⚠️</div><div class="callout-content"><strong>WARNING</strong><br/>${warnContent}</div></div>`;
    }
    if (text.includes('[!NOTE]')) {
        const noteContent = text.replace(/\[!NOTE\]\s*/g, '').replace(/<p>\s*<\/p>/g, '');
        return `<div class="callout callout-note"><div class="callout-icon">📝</div><div class="callout-content"><strong>NOTE</strong><br/>${noteContent}</div></div>`;
    }
    return `<blockquote class="quote-answer">${text}</blockquote>`;
};

let bodyHtml = marked.parse(markdownContent, { renderer });

// Post process HTTP methods into badges
bodyHtml = bodyHtml.replace(/\b(GET|POST|PATCH|DELETE|PUT)\b(?=[,\s<])/g, (match) => {
    const cls = match.toLowerCase();
    return `<span class="http-badge http-${cls}">${match}</span>`;
});

// Post process file links to display as compact badges
bodyHtml = bodyHtml.replace(/<a href="file:\/\/\/[^"]*\/([a-zA-Z0-9_\-\.]+)(?:#L(\d+)(?:-L(\d+))?)?">([^<]+)<\/a>/g, (match, fileName, startLine, endLine, linkText) => {
    return `<span class="code-link">📁 <code>${linkText || fileName}</code></span>`;
});

// Clean up horizontal rules
bodyHtml = bodyHtml.replace(/<hr>/g, '<div class="divider"></div>');

// Full HTML Template
const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Backend Features — Interview Deep Dive</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #2563eb;
            --primary-dark: #1e40af;
            --primary-light: #eff6ff;
            --text-dark: #0f172a;
            --text-body: #334155;
            --text-muted: #64748b;
            --border-light: #e2e8f0;
            --card-bg: #f8fafc;
            --code-bg: #0f172a;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: var(--text-body);
            background: #ffffff;
            line-height: 1.6;
            font-size: 13px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        .container {
            max-width: 820px;
            margin: 0 auto;
            padding: 24px 32px;
        }

        /* Document Header */
        .doc-header {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: #ffffff;
            border-radius: 12px;
            padding: 28px 32px;
            margin-bottom: 24px;
            break-after: avoid;
            page-break-after: avoid;
        }

        .header-badge {
            display: inline-block;
            background: rgba(59, 130, 246, 0.2);
            color: #93c5fd;
            border: 1px solid rgba(147, 197, 253, 0.3);
            font-size: 10.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            padding: 3px 10px;
            border-radius: 16px;
            margin-bottom: 10px;
        }

        .main-title {
            font-size: 24px;
            font-weight: 800;
            line-height: 1.25;
            color: #ffffff;
            margin-bottom: 12px;
            letter-spacing: -0.5px;
        }

        .header-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            font-size: 11.5px;
            color: #94a3b8;
            border-top: 1px solid rgba(255, 255, 255, 0.12);
            padding-top: 12px;
        }

        /* Section Headings */
        h2.section-title {
            font-size: 17px;
            font-weight: 800;
            color: var(--text-dark);
            margin-top: 30px;
            margin-bottom: 14px;
            padding-bottom: 6px;
            border-bottom: 2px solid #e2e8f0;
            display: flex;
            align-items: center;
            gap: 8px;
            break-after: avoid;
            page-break-after: avoid;
        }

        .section-num {
            background: #e0e7ff;
            color: #4338ca;
            padding: 1px 7px;
            border-radius: 5px;
            font-size: 12px;
            font-weight: 800;
        }

        h3.subsection-title {
            font-size: 14px;
            font-weight: 700;
            color: #1e293b;
            margin-top: 18px;
            margin-bottom: 8px;
            break-after: avoid;
            page-break-after: avoid;
        }

        /* Questions */
        .question-header {
            margin-top: 18px;
            margin-bottom: 8px;
            display: flex;
            align-items: baseline;
            gap: 8px;
            break-after: avoid;
            page-break-after: avoid;
        }

        .q-badge {
            background: #fef3c7;
            color: #b45309;
            font-weight: 700;
            font-size: 10px;
            padding: 2px 7px;
            border-radius: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            flex-shrink: 0;
        }

        .q-title {
            font-size: 13.5px;
            font-weight: 700;
            color: #0f172a;
            line-height: 1.35;
        }

        /* Answers & Quotes */
        blockquote.quote-answer {
            background: #f8fafc;
            border-left: 3.5px solid #3b82f6;
            border-radius: 0 6px 6px 0;
            padding: 10px 14px;
            margin: 8px 0 14px 0;
            color: #334155;
            font-size: 12.5px;
            line-height: 1.55;
            break-inside: avoid;
            page-break-inside: avoid;
        }

        blockquote.quote-answer p {
            margin-bottom: 6px;
        }

        blockquote.quote-answer p:last-child {
            margin-bottom: 0;
        }

        blockquote.quote-answer strong {
            color: #0f172a;
        }

        /* Callouts */
        .callout {
            display: flex;
            gap: 10px;
            padding: 12px 14px;
            border-radius: 8px;
            margin: 14px 0;
            font-size: 12.5px;
            break-inside: avoid;
            page-break-inside: avoid;
        }

        .callout-icon {
            font-size: 16px;
            line-height: 1.2;
        }

        .callout-tip {
            background: #ecfdf5;
            border: 1px solid #a7f3d0;
            color: #065f46;
        }

        .callout-tip strong {
            color: #047857;
        }

        .callout-warning {
            background: #fffbeb;
            border: 1px solid #fde68a;
            color: #92400e;
        }

        .callout-note {
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            color: #1e40af;
        }

        /* Tables */
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 12px 0 16px 0;
            font-size: 12px;
            background: #ffffff;
            border: 1px solid var(--border-light);
            border-radius: 6px;
            break-inside: avoid;
            page-break-inside: avoid;
        }

        thead {
            background: #f1f5f9;
        }

        th {
            padding: 8px 10px;
            text-align: left;
            font-weight: 700;
            color: #334155;
            border-bottom: 1px solid #cbd5e1;
            font-size: 11.5px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        td {
            padding: 7px 10px;
            border-bottom: 1px solid #f1f5f9;
            color: #334155;
            vertical-align: top;
        }

        tr:nth-child(even) td {
            background: #f8fafc;
        }

        /* Code Blocks */
        pre {
            background: #0f172a;
            color: #f1f5f9;
            padding: 12px 14px;
            border-radius: 6px;
            margin: 10px 0 14px 0;
            overflow-x: auto;
            font-family: 'JetBrains Mono', 'SF Mono', Consolas, Monaco, monospace;
            font-size: 11.2px;
            line-height: 1.45;
            break-inside: avoid;
            page-break-inside: avoid;
            border: 1px solid #1e293b;
        }

        code {
            font-family: 'JetBrains Mono', 'SF Mono', Consolas, Monaco, monospace;
            font-size: 11px;
            padding: 1px 4px;
            background: #f1f5f9;
            color: #dc2626;
            border-radius: 3px;
            border: 1px solid #e2e8f0;
        }

        pre code {
            padding: 0;
            background: transparent;
            color: inherit;
            border: none;
        }

        /* Code Link Badges */
        .code-link {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            background: #f1f5f9;
            padding: 0 5px;
            border-radius: 4px;
            border: 1px solid #cbd5e1;
            font-size: 10.5px;
            color: #475569;
        }

        .code-link code {
            border: none;
            background: transparent;
            padding: 0;
            color: #2563eb;
            font-weight: 600;
        }

        /* HTTP Badges */
        .http-badge {
            display: inline-block;
            font-size: 9.5px;
            font-weight: 700;
            padding: 1px 5px;
            border-radius: 3px;
            text-transform: uppercase;
            font-family: 'JetBrains Mono', monospace;
            letter-spacing: 0.5px;
        }

        .http-get { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
        .http-post { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
        .http-patch { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
        .http-delete { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
        .http-put { background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }

        .divider {
            height: 1px;
            background: #e2e8f0;
            margin: 20px 0;
        }

        p {
            margin-bottom: 10px;
        }

        ul, ol {
            margin: 6px 0 12px 20px;
        }

        li {
            margin-bottom: 3px;
        }

        /* Syntax colors */
        .hljs-keyword { color: #f472b6; font-weight: 600; }
        .hljs-string { color: #34d399; }
        .hljs-number { color: #fb923c; }
        .hljs-function { color: #60a5fa; }
        .hljs-comment { color: #64748b; font-style: italic; }
        .hljs-title { color: #38bdf8; font-weight: 600; }

        @media print {
            @page {
                size: A4;
                margin: 14mm 12mm 14mm 12mm;
            }

            body {
                font-size: 11pt;
                line-height: 1.5;
            }

            .container {
                max-width: 100%;
                padding: 0;
            }

            pre, blockquote, table, .callout, .question-header {
                break-inside: avoid;
                page-break-inside: avoid;
            }

            h2, h3 {
                break-after: avoid;
                page-break-after: avoid;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        ${bodyHtml}
    </div>
</body>
</html>
`;

fs.writeFileSync(outputHtmlPath, fullHtml);

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chromeCmd = `"${chromePath}" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="${outputPdfPath}" "file://${outputHtmlPath}"`;

execSync(chromeCmd, { stdio: 'inherit' });
console.log('PDF generated at:', outputPdfPath);
