
import { Paper } from "../types";

export async function searchPapers(
    query: string, 
    source: 'SemanticScholar' | 'PubMed', 
    signal?: AbortSignal, 
    retstart: number = 0, 
    retmax: number = 20
): Promise<Paper[]> {
  
  // Real PubMed Fetching
  if (source === 'PubMed') {
      try {
           const encodedQuery = encodeURIComponent(query);
           // 1. Search IDs with pagination
           const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodedQuery}&retmode=json&retstart=${retstart}&retmax=${retmax}`;
           const searchRes = await fetch(searchUrl, { signal });
           const searchJson = await searchRes.json();
           const ids = searchJson.esearchresult?.idlist || [];
           
           if (ids.length === 0) return [];

           // 2. Fetch Details (XML for abstracts)
           const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(',')}&retmode=xml`;
           const fetchRes = await fetch(fetchUrl, { signal });
           const textData = await fetchRes.text();
           
           // 3. Parse XML
           const parser = new DOMParser();
           const xmlDoc = parser.parseFromString(textData, "text/xml");
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
           console.log(`Fetched ${papers.length} papers from PubMed (Offset: ${retstart})`);
           return papers;

      } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') {
              throw e; // Propagate abort
          }
          console.error("PubMed Fetch Error", e);
          // Fallback to mock data if fetch fails
      }
  }

  // Fallback / Semantic Scholar Mock
  // Simulate network delay
  await new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, 800);
      if (signal) {
          signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new DOMException('Aborted', 'AbortError'));
          });
      }
  });
  
  const keywords = query.split(' ');
  const topic = keywords[0] || "General";
  
  // Generate mock results respecting pagination count
  const results: Paper[] = Array.from({ length: retmax }).map((_, i) => {
    const globalIdx = retstart + i;
    const isRelevant = Math.random() > 0.4; 
    const isMedical = Math.random() > 0.3;
    
    let title = `Study ${globalIdx + 1}: `;
    let abstract = "";

    if (isRelevant) {
        title += `Efficacy of ${topic} Phytochemicals in Treating Infection`;
        abstract = `This study explores the impact of ${topic}-derived phytochemicals. We isolated bioactive compounds and tested them against pathogens. Results showed significant efficacy in reducing bacterial load.`;
    } else if (isMedical) {
        title += `Clinical Protocols for Hospital Administration`;
        abstract = `A review of administrative guidelines in modern hospitals. This paper discusses workflow optimization, not drug discovery.`;
    } else {
        title += `Geological Survey of the ${topic} Region`;
        abstract = `We analyze the soil composition and structural integrity of the region. No biological agents were tested.`;
    }

    return {
      id: `${source.toLowerCase()}-${Date.now()}-${globalIdx}`,
      title: title,
      abstract: abstract,
      authors: [`Author ${String.fromCharCode(65 + (i % 26))}`, `Researcher ${globalIdx}`],
      year: 2020 + Math.floor(Math.random() * 5),
      url: `https://example.com/paper/${globalIdx}`,
      source: source,
      doi: `10.1000/${globalIdx}`
    };
  });

  return results;
}
