
import { Paper, ProcessingResult, NetworkLog, ZoteroResult } from "../types";

export class ZoteroService {
  private apiKey: string;
  private libraryId: string;
  private baseUrl: string;
  private useLocal: boolean;
  private onLog?: (log: NetworkLog) => void;

  constructor(config: { apiKey?: string; libraryId?: string; useLocal: boolean; ip?: string; port?: string; onLog?: (log: NetworkLog) => void }) {
    this.apiKey = config.apiKey || "";
    this.libraryId = config.libraryId || "";
    this.useLocal = config.useLocal;
    this.onLog = config.onLog;

    if (this.useLocal) {
        const ip = config.ip || '127.0.0.1';
        const port = config.port || '23119';
        this.baseUrl = `http://${ip}:${port}/users/${this.libraryId || '0'}`;
        this.logInfo('init', `Initialized in LOCAL mode: ${this.baseUrl}`);
    } else {
        this.baseUrl = `https://api.zotero.org/users/${this.libraryId}`;
        this.logInfo('init', `Initialized in CLOUD mode: ${this.baseUrl}`);
    }
  }

  private logInfo(action: string, details: string, body?: any) {
    if (this.onLog) {
        this.onLog({
            id: `zot-info-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            timestamp: Date.now(),
            source: 'Zotero',
            type: 'req', // Use 'req' to show up as an outgoing event
            method: 'INFO',
            url: `[Internal]: ${action}`,
            details: details,
            requestBody: body ? JSON.stringify(body, null, 2) : undefined
        });
    }
  }

  private getHeaders() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.apiKey) {
         headers['Zotero-API-Key'] = this.apiKey;
    }
    if (!this.useLocal) {
         headers['Zotero-API-Version'] = '3';
    }
    return headers;
  }

  private async monitoredFetch(url: string, options: RequestInit): Promise<Response> {
      const requestId = `zot-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const startTime = Date.now();
      const method = options.method || 'GET';
      const path = url.replace(this.baseUrl, '');

      // Log Request
      this.onLog?.({
          id: requestId,
          timestamp: startTime,
          source: 'Zotero',
          type: 'req',
          method: method,
          url: path,
          details: options.body ? `Payload: ${(options.body as string).length} chars` : undefined,
          requestBody: options.body as string
      });

      try {
          const response = await fetch(url, options);

          // Clone response to read text without consuming it
          const clone = response.clone();
          const resText = await clone.text();
          let resBodyStr = resText;
          try {
             resBodyStr = JSON.stringify(JSON.parse(resText), null, 2);
          } catch(e) {}

          this.onLog?.({
            id: requestId + '-res',
            timestamp: Date.now(),
            source: 'Zotero',
            type: 'res',
            method: method,
            url: path,
            status: response.status,
            duration: Date.now() - startTime,
            responseBody: resBodyStr
          });

          return response;
      } catch (e: any) {
           this.onLog?.({
            id: requestId + '-err',
            timestamp: Date.now(),
            source: 'Zotero',
            type: 'err',
            method: method,
            url: path,
            duration: Date.now() - startTime,
            details: e.message
          });
          throw e;
      }
  }

  /**
   * Determines duplicate status based on Title length/word-count or Author fallback.
   * Returns: 'DUPLICATE' | 'UNCERTAIN' | 'NEW'
   */
  async checkDuplicateStatus(paper: Paper): Promise<'DUPLICATE' | 'UNCERTAIN' | 'NEW'> {
    try {
      const cleanTitle = paper.title.trim();
      const titleWords = cleanTitle.split(/\s+/).length;
      
      // Condition: Title has at least 2 words OR is over 20 characters
      const isLongEnough = titleWords >= 2 || cleanTitle.length > 20;

      if (isLongEnough) {
          // STRICT TITLE SEARCH
          const encodedTitle = encodeURIComponent(cleanTitle);
          // Using exact phrase search if possible, or simple q search
          const url = `${this.baseUrl}/items?q=${encodedTitle}&itemType=journalArticle&limit=5`;
          
          this.logInfo('check-dup', `Checking long title: "${cleanTitle.substring(0, 30)}..."`);

          const response = await this.monitoredFetch(url, { method: 'GET', headers: this.getHeaders() });
          if (!response.ok) return 'UNCERTAIN';

          const items = await response.json();
          if (Array.isArray(items) && items.length > 0) {
              const exactMatch = items.some((item: any) => 
                  item.data.title && item.data.title.toLowerCase() === cleanTitle.toLowerCase()
              );
              this.logInfo('check-dup-result', exactMatch ? 'Exact Match Found (DUPLICATE)' : 'Similar Items Found but No Exact Match (NEW)');
              return exactMatch ? 'DUPLICATE' : 'NEW';
          }
          return 'NEW';

      } else {
          // SHORT TITLE FALLBACK: Search by Author
          if (paper.authors.length === 0) return 'UNCERTAIN';
          
          const firstAuthor = paper.authors[0].split(',')[0].trim(); // surname
          const encodedAuthor = encodeURIComponent(firstAuthor);
          const url = `${this.baseUrl}/items?q=${encodedAuthor}&itemType=journalArticle&limit=10`;

          this.logInfo('check-dup', `Short title fallback. Checking Author: "${firstAuthor}"`);

          const response = await this.monitoredFetch(url, { method: 'GET', headers: this.getHeaders() });
          if (!response.ok) return 'UNCERTAIN';

          const items = await response.json();
          if (!Array.isArray(items)) return 'UNCERTAIN';

          if (items.length === 0) {
              return 'UNCERTAIN';
          }
          
          // Check if any of the author's papers match the title exactly
          const titleMatch = items.some((item: any) => 
              item.data.title && item.data.title.toLowerCase() === cleanTitle.toLowerCase()
          );

          this.logInfo('check-dup-result', titleMatch ? 'Author Match + Title Match (DUPLICATE)' : 'Author Found, Title New (NEW)');
          return titleMatch ? 'DUPLICATE' : 'NEW';
      }

    } catch (error: any) {
      console.error("Error checking Zotero duplicate:", error);
      this.logInfo('check-dup-error', `Exception checking duplicates: ${error.message}`);
      return 'UNCERTAIN'; // Default to pink/popup on error
    }
  }

  private formatItem(paper: Paper, result: ProcessingResult): any {
    // Parse authors
    const creators = paper.authors.map(authStr => {
      if (authStr.includes(',')) {
        const [last, first] = authStr.split(',').map(s => s.trim());
        return { creatorType: 'author', firstName: first, lastName: last };
      } else {
        return { creatorType: 'author', name: authStr };
      }
    });

    // Build Combined Abstract (AI + Original)
    let abstractNote = "";
    if (result.aiAnalysis?.summary) {
        abstractNote += `[AI SUMMARY]\n${result.aiAnalysis.summary}\n\n`;
    }
    abstractNote += `[ORIGINAL ABSTRACT]\n${paper.abstract}`;

    // Tags Generation
    const tags = [
        { tag: "EcoScholar" },
        { tag: result.querySource }
    ];

    if (result.aiAnalysis?.tags) {
        result.aiAnalysis.tags.forEach(t => tags.push({ tag: t }));
    }
    if (result.matches && result.matches.length > 0) {
        const sTag = result.matches[0].tag;
        if (sTag) tags.push({ tag: sTag });
    }
    if (result.aiAnalysis?.qualified) {
        tags.push({ tag: "AI_Qualified" });
    }

    const extraInfo = [
       `EcoScholarScore: ${result.aiAnalysis?.score || 0}`,
       `ProcessingStatus: ${result.status}`,
       `Phytochemicals: ${result.aiAnalysis?.phytochemicals || 'None'}`,
       `Plants: ${result.aiAnalysis?.plants || 'None'}`
    ].join('\n');

    return {
      itemType: "journalArticle",
      title: paper.title,
      creators: creators,
      abstractNote: abstractNote,
      publicationTitle: "Extracted by EcoScholar AI", 
      date: paper.year.toString(),
      url: paper.url,
      DOI: paper.doi || "",
      tags: tags,
      extra: extraInfo
    };
  }

  async uploadItems(items: { paper: Paper; result: ProcessingResult }[]): Promise<ZoteroResult[]> {
    const results: ZoteroResult[] = [];
    this.logInfo('batch-start', `Starting upload for ${items.length} items...`);

    for (const item of items) {
        // 1. Check Duplication Logic
        const status = await this.checkDuplicateStatus(item.paper);

        if (status === 'DUPLICATE') {
            results.push({ paperTitle: item.paper.title, status: 'DUPLICATE' });
            continue;
        }

        if (status === 'UNCERTAIN') {
            // "Colorize in dark pink if... cant determine... and save a popup list"
            // We skip upload and report it as UNCERTAIN so the UI can popup.
            results.push({ paperTitle: item.paper.title, status: 'UNCERTAIN', details: "Short title or API error - Manual verify needed" });
            continue;
        }

        // Status is NEW -> Proceed to Upload
        const zoteroItem = this.formatItem(item.paper, item.result);
        
        this.logInfo('upload-prep', `Uploading: ${item.paper.title.substring(0,30)}...`, zoteroItem);

        try {
            const response = await this.monitoredFetch(`${this.baseUrl}/items`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify([zoteroItem])
            });

            if (response.ok) {
                results.push({ paperTitle: item.paper.title, status: 'UPLOADED' });
            } else {
                const errText = await response.text();
                this.logInfo('upload-fail', `Server rejected item`, { error: errText });
                results.push({ paperTitle: item.paper.title, status: 'ERROR', details: errText });
            }
        } catch (e: any) {
            this.logInfo('upload-fail', `Network exception`, { error: e.message });
            results.push({ paperTitle: item.paper.title, status: 'ERROR', details: e.message });
        }
    }
    
    this.logInfo('batch-complete', `Batch complete. Uploaded: ${results.filter(r => r.status === 'UPLOADED').length}, Duplicates: ${results.filter(r => r.status === 'DUPLICATE').length}, Errors: ${results.filter(r => r.status === 'ERROR').length}`);

    return results;
  }
}
