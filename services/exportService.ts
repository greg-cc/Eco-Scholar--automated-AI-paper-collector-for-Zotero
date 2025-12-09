import { Paper, ProcessingResult } from "../types";

/**
 * Generates an RIS file content string from a list of papers.
 * RIS is compatible with Zotero, EndNote, Mendeley, etc.
 */
export function generateRIS(results: { paper: Paper; result: ProcessingResult }[]): string {
  const qualifiedItems = results.filter(
    r => r.result.status === 'QUALIFIED' || r.result.status === 'QUALIFIED_TURBO'
  );

  if (qualifiedItems.length === 0) return "";

  let risContent = "";

  qualifiedItems.forEach(({ paper, result }) => {
    risContent += "TY  - JOUR\n"; // Type: Journal Article
    risContent += `TI  - ${paper.title}\n`;
    
    // Authors
    paper.authors.forEach(author => {
      risContent += `AU  - ${author}\n`;
    });

    // Abstract (append AI summary if available)
    let abstract = paper.abstract;
    if (result.aiAnalysis?.summary) {
        abstract += ` [AI SUMMARY: ${result.aiAnalysis.summary}]`;
    }
    risContent += `AB  - ${abstract}\n`;

    risContent += `PY  - ${paper.year}\n`;
    
    if (paper.doi) {
      risContent += `DO  - ${paper.doi}\n`;
    }
    
    if (paper.url) {
      risContent += `UR  - ${paper.url}\n`;
    }

    // Custom notes for Zotero
    risContent += `N1  - EcoScholar Score: ${result.aiAnalysis?.score || 'N/A'}\n`;
    risContent += `KW  - ${result.querySource}\n`; // Keyword = Search Query

    if (result.aiAnalysis?.tags) {
        result.aiAnalysis.tags.forEach(tag => {
            risContent += `KW  - ${tag}\n`;
        });
    }

    risContent += "ER  - \n\n"; // End of Record
  });

  return risContent;
}

export function downloadRIS(content: string, filename: string = "ecoscholar_export.ris") {
  const blob = new Blob([content], { type: "application/x-research-info-systems" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}