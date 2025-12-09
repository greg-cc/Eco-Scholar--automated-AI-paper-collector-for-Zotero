// Implements the "Cluster Density Hunting" algorithm from the Python script
// adapted for the Browser DOM API.

export class ScraperService {
  
  private garbageTriggers = [
    "copyright", "all rights reserved", "log in", "sign up", "et al.", "doi:", 
    "google scholar", "pubmed", "subscribe", "citation", "cookie", "policy"
  ];

  /**
   * Attempts to fetch and extract relevant academic text from a URL.
   * Includes CORS proxy fallback for browser environments.
   */
  async extractWebpageText(url: string): Promise<string> {
    if (!url) return "";

    let html = "";

    // Helper for fetching with timeout
    const fetchWithTimeout = async (input: string, init?: RequestInit) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 8000); // 8s timeout
        try {
            const response = await fetch(input, { ...init, signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (e) {
            clearTimeout(id);
            throw e;
        }
    };

    try {
      console.log(`[SCRAPER] Attempting to fetch: ${url}`);
      
      // Strategy 1: Direct Fetch (Will likely fail for most external sites due to CORS)
      try {
        const response = await fetchWithTimeout(url, {
            method: 'GET',
            headers: { 'Accept': 'text/html' }
        });
        if (response.ok) html = await response.text();
      } catch (e) {
          // Ignore direct failure (likely CORS)
      }

      // Strategy 2: CORS Proxy Fallback
      if (!html) {
          try {
             // Using allorigins.win raw API to bypass CORS
             const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
             // console.log(`[SCRAPER] Direct fetch failed. Using proxy: ${proxyUrl}`);
             
             const response = await fetchWithTimeout(proxyUrl);
             if (response.ok) html = await response.text();
          } catch (e) {
             console.warn(`[SCRAPER] Proxy fetch also failed for ${url}`);
             return "";
          }
      }

      if (!html) return "";

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // 1. Check for Meta PDF
      const pdfMeta = doc.querySelector('meta[name="citation_pdf_url"]');
      if (pdfMeta) {
        const content = pdfMeta.getAttribute('content');
        if (content) {
          console.log(`[SCRAPER] Found PDF Meta: ${content}`);
        }
      }

      // 2. Clean DOM (Remove scripts, styles, navs)
      const tagsToRemove = ['script', 'style', 'nav', 'footer', 'header', 'meta', 'noscript', 'aside', 'form', 'button', 'input', 'iframe', 'svg'];
      tagsToRemove.forEach(tag => {
        doc.querySelectorAll(tag).forEach(el => el.remove());
      });

      // 3. Cluster Density Analysis
      const parentScores = new Map<HTMLElement, number>();
      const paragraphs = doc.querySelectorAll('p');

      paragraphs.forEach(p => {
        const text = p.textContent || "";
        const cleanText = text.replace(/\s+/g, ' ').trim();
        const wordCount = cleanText.split(' ').length;

        // Filter Level 1: Basic Hygiene
        if (wordCount < 20) return;
        
        const lowerText = cleanText.toLowerCase();
        if (this.garbageTriggers.some(trigger => lowerText.includes(trigger))) return;

        // Filter Level 2: Sentence Structure
        const sentences = cleanText.split(/[.!?]\s+(?=[A-Z])/);
        if (sentences.length < 2) return;

        // Scoring
        const parent = p.parentElement as HTMLElement;
        if (!parent) return;

        // Handle some common wrapper tags by moving up
        let effectiveParent = parent;
        if (['SPAN', 'STRONG', 'EM', 'A', 'B', 'I'].includes(parent.tagName)) {
            if (parent.parentElement) effectiveParent = parent.parentElement;
        }

        let score = cleanText.length;
        if (wordCount > 60) score *= 1.5; // Density Multiplier

        const currentScore = parentScores.get(effectiveParent) || 0;
        parentScores.set(effectiveParent, currentScore + score);
      });

      if (parentScores.size === 0) {
        return "";
      }

      // 4. Pick Winner
      let bestParent: HTMLElement | null = null;
      let maxScore = -1;

      for (const [node, score] of parentScores.entries()) {
        if (score > maxScore) {
          maxScore = score;
          bestParent = node;
        }
      }

      if (!bestParent) return "";

      // 5. Extract Text from Winner
      const finalBlocks: string[] = [];
      
      const descendants = bestParent.querySelectorAll('*');
      for (let i = 0; i < descendants.length; i++) {
          const el = descendants[i] as HTMLElement;
          
          // Stop triggers
          if (['H1','H2','H3','H4','H5'].includes(el.tagName)) {
              const headerText = (el.textContent || "").toLowerCase();
              if (headerText.includes('reference') || headerText.includes('bibliography')) {
                  break; 
              }
          }

          if (el.tagName === 'P') {
              const t = (el.textContent || "").replace(/\s+/g, ' ').trim();
              if (t.split(' ').length > 15) {
                  finalBlocks.push(t);
              }
          }
      }

      if (finalBlocks.length === 0) {
          return (bestParent.textContent || "").substring(0, 10000);
      }

      const uniqueBlocks = [...new Set(finalBlocks)];
      const resultText = uniqueBlocks.join("\n\n").substring(0, 40000);
      
      console.log(`[SCRAPER] Success! Extracted ${resultText.length} chars.`);
      return resultText;

    } catch (e) {
      console.warn(`[SCRAPER] Error extracting text:`, e);
      return "";
    }
  }
}