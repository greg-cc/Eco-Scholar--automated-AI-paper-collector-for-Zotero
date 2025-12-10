
import { Paper, ProcessingResult, NetworkLog, ZoteroResult } from "../types";

export class ZoteroService {
  private apiKey: string;
  private libraryId: string;
  private baseUrl: string;
  private useLocal: boolean;
  private onLog?: (log: NetworkLog) => void;

  constructor(config: { apiKey?: string; libraryId?: string; useLocal: boolean; ip?: string; port?: string; onLog?: (log: NetworkLog) => void }) {
    this.apiKey = config.apiKey || "";
    this.libraryId = (config.libraryId || "").trim();
    this.useLocal = config.useLocal;
    this.onLog = config.onLog;

    const libPart = this.libraryId ? this.libraryId : '0';

    // FORCE HTTP to comply with local instance requirements
    if (this.useLocal) {
        const ip = config.ip || '127.0.0.1';
        const port = config.port || '23119';
        this.baseUrl = `http://${ip}:${port}/libraries/${libPart}`;
        this.logInfo('init', `Initialized in LOCAL mode: ${this.baseUrl}`);
    } else {
        // CLOUD MODE - Strict HTTP
        if (!this.libraryId) {
            this.baseUrl = `http://api.zotero.org/libraries/[MISSING_ID]`;
            this.logInfo('init', `Initialized in CLOUD mode (WARNING: No Library ID set): ${this.baseUrl}`);
        } else {
            this.baseUrl = `http://api.zotero.org/libraries/${this.libraryId}`;
            this.logInfo('init', `Initialized in CLOUD mode: ${this.baseUrl}`);
        }
    }
  }

  private logInfo(action: string, details: string, body?: any) {
    if (this.onLog) {
        let verboseDump = "";
        if (body) {
            verboseDump = JSON.stringify(body, null, 2);
        }

        this.onLog({
            id: `zot-info-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            timestamp: Date.now(),
            source: 'Zotero',
            type: 'req', 
            method: 'INFO',
            url: `[Internal]: ${action}`,
            details: details, 
            requestBody: verboseDump || undefined
        });
    }
  }

  private getHeaders() {
    // For local Zotero, use text/plain to attempt to avoid complex CORS preflights where possible,
    // though Zotero-Allowed-Request will likely trigger it anyway.
    const headers: Record<string, string> = {
      'Content-Type': this.useLocal ? 'text/plain' : 'application/json'
    };
    
    if (this.useLocal) {
         headers['Zotero-Allowed-Request'] = 'true';
         headers['Zotero-Connector-Version'] = '5.0';
    } else {
         headers['Zotero-API-Version'] = '3';
         if (this.apiKey) {
             headers['Zotero-API-Key'] = this.apiKey;
         }
    }
    return headers;
  }

  private async monitoredFetch(url: string, options: RequestInit): Promise<Response> {
      const requestId = `zot-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const startTime = Date.now();
      const method = options.method || 'GET';
      const path = url.replace(this.baseUrl, '');

      // 1. Construct Full Verbose Request Dump
      const reqHeaders = options.headers || this.getHeaders();
      const requestDump = [
          `--- REQUEST ---`,
          `URL: ${url}`,
          `METHOD: ${method}`,
          `HEADERS: ${JSON.stringify(reqHeaders, null, 2)}`,
          `BODY:`,
          options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body, null, 2)) : "(No Body)"
      ].join('\n');

      // Log Request
      this.onLog?.({
          id: requestId,
          timestamp: startTime,
          source: 'Zotero',
          type: 'req',
          method: method,
          url: path,
          details: "Sending request...", 
          requestBody: requestDump
      });

      try {
          const response = await fetch(url, options);

          // 2. Construct Full Verbose Response Dump
          const clone = response.clone();
          const resText = await clone.text();
          
          const resHeaders: Record<string, string> = {};
          response.headers.forEach((v, k) => resHeaders[k] = v);

          let prettyBody = resText;
          try {
             prettyBody = JSON.stringify(JSON.parse(resText), null, 2);
          } catch(e) {}

          const responseDump = [
               `--- RESPONSE ---`,
               `STATUS: ${response.status} ${response.statusText}`,
               `HEADERS: ${JSON.stringify(resHeaders, null, 2)}`,
               `BODY:`,
               prettyBody
          ].join('\n');

          this.onLog?.({
            id: requestId + '-res',
            timestamp: Date.now(),
            source: 'Zotero',
            type: 'res',
            method: method,
            url: path,
            status: response.status,
            duration: Date.now() - startTime,
            responseBody: responseDump
          });

          return response;
      } catch (e: any) {
           // 3. Log Error with Context & SANITIZED Stack
           let cleanStack = e.stack || 'No stack trace';
           cleanStack = cleanStack.replace(/data:application\/javascript;base64,[A-Za-z0-9+/=]+/g, '[INTERNAL_CODE_BLOB]');

           const errorDump = [
               `--- NETWORK ERROR ---`,
               `URL: ${url}`,
               `ERROR MESSAGE: ${e.message}`,
               `STACK: ${cleanStack}`
           ].join('\n');

           this.onLog?.({
            id: requestId + '-err',
            timestamp: Date.now(),
            source: 'Zotero',
            type: 'err',
            method: method,
            url: path,
            duration: Date.now() - startTime,
            details: `Exception: ${e.message}`,
            responseBody: errorDump 
          });
          throw e;
      }
  }

  /**
   * Checks connection to Zotero API.
   */
  async checkConnection(): Promise<{ success: boolean; message: string }> {
    // Explicitly use the baseUrl which is guaranteed to be HTTP
    const url = `${this.baseUrl}/items?limit=1`;
    this.logInfo('check-connection', `Testing connection to: ${this.baseUrl}`);
    
    try {
        const response = await this.monitoredFetch(url, { method: 'GET', headers: this.getHeaders() });
        if (response.ok) {
             return { success: true, message: "Connection Successful!" };
        } else {
             return { success: false, message: `HTTP Error: ${response.status} ${response.statusText}` };
        }
    } catch (e: any) {
        return { success: false, message: `Network Error: ${e.message}` };
    }
  }

  /**
   * Determines duplicate status based on Title length/word-count or Author fallback.
   * Returns: 'DUPLICATE' | 'UNCERTAIN' | 'NEW'
   */
  async checkDuplicateStatus(paper: Paper): Promise<'DUPLICATE' | 'UNCERTAIN' | 'NEW'> {
    if (!this.useLocal && !this.libraryId) return 'UNCERTAIN';

    try {
      const cleanTitle = paper.title.trim();
      const titleWords = cleanTitle.split(/\s+/).length;
      const isLongEnough = titleWords >= 2 || cleanTitle.length > 20;

      if (isLongEnough) {
          const encodedTitle = encodeURIComponent(cleanTitle);
          const url = `${this.baseUrl}/items?q=${encodedTitle}&itemType=journalArticle&limit=5`;
          this.logInfo('check-dup', `Checking long title: "${cleanTitle}"`);

          const response = await this.monitoredFetch(url, { method: 'GET', headers: this.getHeaders() });
          if (!response.ok) return 'UNCERTAIN';

          const items = await response.json();
          if (Array.isArray(items) && items.length > 0) {
              const exactMatch = items.some((item: any) => 
                  item.data.title && item.data.title.toLowerCase() === cleanTitle.toLowerCase()
              );
              return exactMatch ? 'DUPLICATE' : 'NEW';
          }
          return 'NEW';

      } else {
          if (paper.authors.length === 0) return 'UNCERTAIN';
          const firstAuthor = paper.authors[0].split(',')[0].trim();
          const encodedAuthor = encodeURIComponent(firstAuthor);
          const url = `${this.baseUrl}/items?q=${encodedAuthor}&itemType=journalArticle&limit=10`;

          this.logInfo('check-dup', `Short title fallback. Checking Author: "${firstAuthor}"`);
          const response = await this.monitoredFetch(url, { method: 'GET', headers: this.getHeaders() });
          if (!response.ok) return 'UNCERTAIN';

          const items = await response.json();
          if (!Array.isArray(items) || items.length === 0) return 'UNCERTAIN';
          
          const titleMatch = items.some((item: any) => 
              item.data.title && item.data.title.toLowerCase() === cleanTitle.toLowerCase()
          );
          return titleMatch ? 'DUPLICATE' : 'NEW';
      }

    } catch (error: any) {
      console.warn("Error checking Zotero duplicate:", error);
      this.logInfo('check-dup-error', `Exception checking duplicates (Defaulting to NEW to ensure upload): ${error.message}`);
      return 'NEW'; 
    }
  }

  // Helpers to sanitize data and prevent 413/409 errors in Zotero
  private sanitizeTag(tag: string): string {
      // 1. Convert to string
      const str = String(tag || "");
      
      // 2. Strict Whitelist: Allow alphanumeric, spaces, hyphens, underscores. 
      // This removes weird JS injection code like "0); const scriptableStream..."
      let clean = str.replace(/[^a-zA-Z0-9 \-_]/g, '').trim();
      
      // 3. Truncate to 50 chars (Zotero tags can be longer, but extremely long tags cause sync errors)
      if (clean.length > 50) clean = clean.substring(0, 50);
      
      return clean;
  }

  private truncate(str: string, maxLen: number): string {
      if (!str) return "";
      if (str.length <= maxLen) return str;
      return str.substring(0, maxLen - 3) + "...";
  }

  private formatItem(paper: Paper, result: ProcessingResult): any {
    const creators = paper.authors.map(authStr => {
      if (authStr.includes(',')) {
        const [last, first] = authStr.split(',').map(s => s.trim());
        return { creatorType: 'author', firstName: this.truncate(first, 100), lastName: this.truncate(last, 100) };
      } else {
        return { creatorType: 'author', name: this.truncate(authStr, 200) };
      }
    });

    let abstractNote = "";
    if (result.aiAnalysis?.summary) {
        abstractNote += `[AI SUMMARY]\n${result.aiAnalysis.summary}\n\n`;
    }
    abstractNote += `[ORIGINAL ABSTRACT]\n${paper.abstract}`;

    // Aggressive sanitization of tags to prevent Code Injection in Zotero Sync and 413 errors
    const rawTags = [
        "EcoScholar",
        result.querySource,
        ...(result.aiAnalysis?.tags || []),
        (result.matches?.[0]?.tag),
        (result.aiAnalysis?.qualified ? "AI_Qualified" : "")
    ];

    const tags = rawTags
        .filter(t => t && typeof t === 'string')
        .map(t => ({ tag: this.sanitizeTag(t!) }))
        .filter(t => t.tag.length > 2); // Filter out empty or tiny tags after sanitization

    const extraInfo = [
       `EcoScholarScore: ${result.aiAnalysis?.score || 0}`,
       `ProcessingStatus: ${result.status}`,
       `Phytochemicals: ${this.truncate(result.aiAnalysis?.phytochemicals || 'None', 200)}`,
       `Plants: ${this.truncate(result.aiAnalysis?.plants || 'None', 200)}`
    ].join('\n');

    return {
      itemType: "journalArticle",
      title: this.truncate(paper.title, 250),
      creators: creators,
      // Truncate abstract to avoid 413 Payload Too Large
      abstractNote: this.truncate(abstractNote, 10000), 
      publicationTitle: "Extracted by EcoScholar AI", 
      date: paper.year.toString(),
      url: this.truncate(paper.url, 1000),
      DOI: this.truncate(paper.doi || "", 100),
      tags: tags,
      extra: this.truncate(extraInfo, 2000)
    };
  }

  async uploadItems(items: { paper: Paper; result: ProcessingResult }[]): Promise<ZoteroResult[]> {
    const results: ZoteroResult[] = [];
    
    if (!this.useLocal && !this.libraryId) {
        const msg = "Zotero Library ID missing. Cannot upload.";
        this.logInfo('batch-abort', msg);
        return items.map(i => ({ paperTitle: i.paper.title, status: 'ERROR', details: msg }));
    }

    this.logInfo('batch-start', `Starting upload for ${items.length} items...`);

    for (const item of items) {
        const status = await this.checkDuplicateStatus(item.paper);

        if (status === 'DUPLICATE') {
            results.push({ paperTitle: item.paper.title, status: 'DUPLICATE' });
            continue;
        }

        if (status === 'UNCERTAIN' && !this.useLocal) {
            results.push({ paperTitle: item.paper.title, status: 'UNCERTAIN', details: "Manual verify needed" });
            continue;
        }

        // Format and Sanitization happens here
        const zoteroItem = this.formatItem(item.paper, item.result);
        
        this.logInfo('upload-prep', `Uploading: ${item.paper.title}`, zoteroItem);

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
    
    this.logInfo('batch-complete', `Batch complete. Uploaded: ${results.filter(r => r.status === 'UPLOADED').length}`);
    return results;
  }
}
