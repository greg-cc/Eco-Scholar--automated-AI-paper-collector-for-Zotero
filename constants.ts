
import { SemanticSentence } from './types';

export const GEMINI_MODELS = [
  { value: "gemini-2.0-flash-lite-preview-02-05", label: "gemini-2.0-flash-lite-preview-02-05", desc: "Newest Lite model. Fast and cost-effective." },
  { value: "gemini-2.0-flash", label: "gemini-2.0-flash (Default, 7 GB)", desc: "Stable version. General purpose, fast. 1M TPM." },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (Complex Tasks, 15 GB)", desc: "Highest reasoning capacity. 2M TPM." },
  { value: "models/gemini-2.5-flash-lite", label: "gemini-2.5-flash-lite (Quota Fallback)", desc: "High throughput, cost-efficient. 4M TPM." },
  { value: "models/gemini-1.5-flash", label: "gemini-1.5-flash", desc: "Previous Gen Flash. Good for fallback." },
  { value: "models/gemini-1.5-flash-8b", label: "gemini-1.5-flash-8b", desc: "Fastest, lowest latency, lower intelligence." },
  { value: "models/gemini-1.5-pro", label: "gemini-1.5-pro", desc: "Previous Gen Pro. Strong reasoning." },
  { value: "models/gemini-2.0-flash-exp", label: "gemini-2.0-flash-exp", desc: "Experimental 2.0. Often has separate/higher quotas." },
  { value: "models/gemini-experimental", label: "gemini-experimental", desc: "Bleeding edge experimental features." },
  { value: "models/gemini-pro-experimental", label: "gemini-pro-experimental", desc: "Experimental Pro version." },
  { value: "models/gemini-flash-experimental", label: "gemini-flash-experimental", desc: "Experimental Flash version." },
  { value: "models/gemma-2-27b-it", label: "gemma-2-27b-it (Open Model)", desc: "Open model (27B). Hosted on Google endpoints." },
  { value: "models/gemma-2-9b-it", label: "gemma-2-9b-it (Open Model)", desc: "Open model (9B). Faster, lower memory." },
  { value: "models/gemma-2-2b-it", label: "gemma-2-2b-it (Open Model)", desc: "Tiny open model. Very fast, lower quality." },
];

export const DEFAULT_GRADING_TOPICS = [
  "Carotenoids", "phytochemicals", "Phytonutrient", "Biologically Active", "ALKALOIDS", "TCM", 
  "polyphenols", "plant extracts", "dose-dependent", "synergistic", "phenolic acids", "coumarins", 
  "stilbenes", "Terpenoids", "Terpenes", "Glucosinolates", "Organosulfur", "Phytosterols", 
  "Saponins", "flavonoids", "Homology modeling", "Herbs", "herbal compounds"
];

export const DEFAULT_SEMANTIC_SENTENCES: SemanticSentence[] = [
  { id: '1', text: "The paper is a research paper on killing infective agents of humans using phytochemicals.", enabled: true, positive: true, customTag: "phytochemicals" },
  { id: '2', text: "The paper is primarily a review or meta-analysis", enabled: true, positive: false, customTag: "The-paper" },
  { id: '3', text: "The paper is primarily about the biology of an organism.", enabled: true, positive: false, customTag: "The-paper" },
  { id: '4', text: "The paper is primarily about the physical location of an organism", enabled: true, positive: false, customTag: "The-paper" },
  { id: '5', text: "The content focuses on a medical study testing the efficacy of a compound to treat an aliment.", enabled: true, positive: true, customTag: "phytochemicals" },
  { id: '6', text: "The content focuses on a study testing efficacy of phytochemicals against an organism.", enabled: true, positive: true, customTag: "phytochemicals" },
  { id: '7', text: "This content is related to things outside of health and medicine.", enabled: true, positive: false, customTag: "This-content" },
  { id: '8', text: "This content is an analysis of medical advise and medical guidelines for doctors.", enabled: true, positive: false, customTag: "This-content" },
  { id: '9', text: "This content analyzes the decision making process.", enabled: true, positive: false, customTag: "This-content" },
  { id: '10', text: "This content discussed the logic of medical diagnosis and unnecessary therapy.", enabled: true, positive: false, customTag: "This-content" },
  { id: '11', text: "This content is an analysis and overview for doctors.", enabled: true, positive: false, customTag: "This-content" },
  { id: '12', text: "This paper details a research investigation seeking a cure.", enabled: true, positive: true, customTag: "phytochemicals" },
  { id: '13', text: "This content contains herbal or herbal compounds being tested for the medicinal value.", enabled: true, positive: true, customTag: "phytochemicals" },
  { id: '14', text: "This content does not contains herbal or herbal compounds being tested for the medicinal value.", enabled: true, positive: false, customTag: "This-content" },
  { id: '15', text: "This content does not explore the medicinal value of herbal or herbal compounds.", enabled: true, positive: false, customTag: "This-content" },
  { id: '16', text: "This content does explore the medicinal value of herbal or herbal compounds.", enabled: true, positive: true, customTag: "phytochemicals" },
  { id: '17', text: "This contens discusses  Carotenoids OR Plant-Derived OR herbal extracts OR phytochemicals OR  Bioactive OR Phytonutrient OR Biologically Active OR Compounds OR ALKALOIDS OR TCM OR polyphenols OR plant extracts OR dose-dependent OR receptors OR synergistic OR phenolic acids OR  coumarins OR  stilbenes OR Terpenoids OR Terpenes OR Glucosinolates OR Organosulfur OR Phytosterols OR Saponins OR flavonoids", enabled: true, positive: true, customTag: "phytochemicals" },
  { id: '18', text: "The content discusses x-rays or radiation therapy or chemotherapy or radiation sickness", enabled: true, positive: false, customTag: "The" }
];

export const MOCK_PAPERS = [
  {
    id: 'mock-1',
    title: 'Efficacy of Artemisinin in Malaria Treatment',
    abstract: 'This study investigates the effects of artemisinin derivatives on Plasmodium falciparum. Our results show significant reduction in parasitemia.',
    authors: ['Doe, J.', 'Smith, A.'],
    year: 2023,
    url: '#',
    source: 'PubMed' as const
  },
  {
    id: 'mock-2',
    title: 'A Review of Modern Architecture',
    abstract: 'We discuss the evolution of skyscrapers in the 21st century. No medical relevance.',
    authors: ['Johnson, B.'],
    year: 2022,
    url: '#',
    source: 'SemanticScholar' as const
  }
];
