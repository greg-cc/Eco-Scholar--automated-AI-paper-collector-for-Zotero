
import { Paper } from "../types";

/**
 * Step 1: Get all IDs for the query range in one go.
 * Returns both the list of IDs and the total count available in the database.
 */
export async function getPubMedIds(
    query: string, 
    retstart: number = 0, 
    retmax: number = 1000,
    signal?: AbortSignal
): Promise<{ ids: string[]; total: number }> {
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
        try {
            attempt++;
            const encodedQuery = encodeURIComponent(query);
            // Ensure retmax is respected by the API
            const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodedQuery}&retmode=json&retstart=${retstart}&retmax=${retmax}&sort=date`;
            
            const res = await fetch(searchUrl, { signal });
            if (!res.ok) throw new Error(`PubMed Search HTTP ${res.status}`);
            
            const json = await res.json();
            const total = parseInt(json.esearchresult?.count || '0', 10);
            const ids = json.esearchresult?.idlist || [];
            
            return { ids, total };

        } catch (e: any) {
            if (e.name === 'AbortError') throw e;
            console.warn(`PubMed ID Fetch Retry ${attempt}/${MAX_RETRIES}`, e);
            if (attempt >= MAX_RETRIES) throw e;
            await new Promise(r => setTimeout(r, 1000 * attempt)); // Linear backoff
        }
    }
    return { ids: [], total: 0 };
}

/**
 * Step 2: Fetch details for a specific batch of IDs.
 */
export async function fetchPubMedPapers(
    ids: string[], 
    signal?: AbortSignal
): Promise<Paper[]> {
    if (ids.length === 0) return [];
    
    const MAX_RETRIES = 5;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
        try {
            attempt++;
            
            // EFetch details (heavyweight)
            const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(',')}&retmode=xml`;
            const fetchRes = await fetch(fetchUrl, { signal });
            if (!fetchRes.ok) throw new Error(`PubMed Fetch HTTP ${fetchRes.status}`);
            
            const textData = await fetchRes.text();
            
            // Check for Empty or Malformed response
            if (!textData || textData.trim().length === 0) {
                console.warn("Empty response from PubMed EFetch");
                return [];
            }

            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(textData, "text/xml");
            
            // Check for XML Parse Errors
            if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
                 console.warn("XML Parser Error in fetchPubMedPapers");
                 throw new Error("XML Parse Error");
            }

            const articles = xmlDoc.getElementsByTagName("PubmedArticle");
            
            const papers: Paper[] = [];
            for (let i = 0; i < articles.length; i++) {
                const art = articles[i];
                const title = art.querySelector("ArticleTitle")?.textContent || "Untitled";
                const abstractNodes = art.querySelectorAll("AbstractText");
                const abstractText = Array.from(abstractNodes).map(n => n.textContent).join(" ");
                
                const authors = Array.from(art.querySelectorAll("Author"))
                    .map(a => `${a.querySelector("LastName")?.textContent || ''} ${a.querySelector("Initials")?.textContent || ''}`.trim())
                    .filter(n => n.length > 0);
                
                const yearStr = art.querySelector("PubDate Year")?.textContent || "2024";
                const doi = art.querySelector("ArticleId[IdType='doi']")?.textContent;
                const pmid = art.querySelector("PMID")?.textContent;

                if (title) {
                    papers.push({
                        id: pmid || `pm-${Date.now()}-${i}`,
                        title,
                        abstract: abstractText || "No abstract available.",
                        authors: authors.length ? authors : ["Unknown"],
                        year: parseInt(yearStr),
                        url: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
                        source: 'PubMed',
                        doi: doi || undefined
                    });
                }
            }
            return papers;

        } catch (e: any) {
            if (e.name === 'AbortError') throw e;
            console.warn(`PubMed Details Retry ${attempt}/${MAX_RETRIES}:`, e);
            
            if (attempt >= MAX_RETRIES) {
                console.error("PubMed fetch completely failed.");
                return []; // Return empty on final failure to allow loop to continue
            }
            // Exponential backoff
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
    }
    return [];
}

/**
 * Real Semantic Scholar Search
 * Updated to support pagination via offset and return total
 */
export async function searchSemanticScholar(
    query: string, 
    limit: number = 20, 
    offset: number = 0,
    signal?: AbortSignal
): Promise<{ papers: Paper[], total: number }> {
    try {
        const fields = "title,abstract,authors,year,url,externalIds";
        const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&fields=${fields}`;
        
        const res = await fetch(url, { signal });
        if (!res.ok) {
            if (res.status === 429) throw new Error("Semantic Scholar Rate Limit Exceeded");
            throw new Error(`Semantic Scholar HTTP ${res.status}`);
        }

        const data = await res.json();
        const total = data.total || 0;
        
        if (!data.data) return { papers: [], total };

        const papers = data.data.map((item: any) => ({
            id: item.paperId,
            title: item.title,
            abstract: item.abstract || "No abstract available via API.",
            authors: item.authors ? item.authors.map((a: any) => a.name) : ["Unknown"],
            year: item.year || new Date().getFullYear(),
            url: item.url || item.externalIds?.DOI ? `https://doi.org/${item.externalIds.DOI}` : `https://www.semanticscholar.org/paper/${item.paperId}`,
            source: 'SemanticScholar',
            doi: item.externalIds?.DOI
        }));

        return { papers, total };

    } catch (e: any) {
        if (e.name === 'AbortError') throw e;
        console.error("Semantic Scholar Search Error:", e);
        return { papers: [], total: 0 };
    }
}
