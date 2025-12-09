
import { Paper } from "../types";

export async function searchPapers(
    query: string, 
    source: 'SemanticScholar' | 'PubMed', 
    signal?: AbortSignal, 
    retstart: number = 0, 
    retmax: number = 50
): Promise<Paper[]> {
  
  if (source === 'PubMed') {
      const MAX_RETRIES = 3;
      let attempt = 0;

      while (attempt < MAX_RETRIES) {
          try {
               attempt++;
               if (attempt > 1) await new Promise(r => setTimeout(r, 1000 * attempt));

               const encodedQuery = encodeURIComponent(query);
               const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodedQuery}&retmode=json&retstart=${retstart}&retmax=${retmax}&sort=date`;
               
               const searchRes = await fetch(searchUrl, { signal });
               if (!searchRes.ok) throw new Error(`PubMed Search HTTP ${searchRes.status}`);
               
               const searchJson = await searchRes.json();
               const ids = searchJson.esearchresult?.idlist || [];
               
               if (ids.length === 0) return [];

               const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(',')}&retmode=xml`;
               const fetchRes = await fetch(fetchUrl, { signal });
               if (!fetchRes.ok) throw new Error(`PubMed Fetch HTTP ${fetchRes.status}`);
               
               const textData = await fetchRes.text();
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
               console.log(`Fetched ${papers.length} papers from PubMed`);
               return papers;

          } catch (e: any) {
              if (e.name === 'AbortError') throw e;
              console.warn(`PubMed Retry ${attempt}:`, e);
              // Throw on final attempt to trigger App error handling
              if (attempt >= MAX_RETRIES) throw new Error(`PubMed Failed: ${e.message}`);
          }
      }
  }

  // Fallback Mock (Semantic Scholar)
  await new Promise(r => setTimeout(r, 500));
  const keywords = query.split(' ');
  const topic = keywords[0] || "General";
  return Array.from({ length: retmax }).map((_, i) => {
    const idx = retstart + i;
    return {
      id: `ss-${idx}`,
      title: `Study ${idx}: Efficacy of ${topic} compounds`,
      abstract: `This study analyzes ${topic} and its effects on biological systems.`,
      authors: ["Mock Author"],
      year: 2024,
      url: "#",
      source: 'SemanticScholar'
    };
  });
}
