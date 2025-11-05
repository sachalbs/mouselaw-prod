import { supabaseServer } from '@/lib/supabase/server';

interface EmbeddingResponse {
  id: string;
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

interface SimilarArticle {
  id: string;
  article_number: string;
  title: string | null;
  content: string;
  category: string | null;
  similarity: number;
}

const MISTRAL_EMBED_URL = 'https://api.mistral.ai/v1/embeddings';
const MISTRAL_EMBED_MODEL = 'mistral-embed';

/**
 * Generate an embedding vector for a given text using Mistral Embed API
 * @param text - The text to embed
 * @returns The embedding vector (1024 dimensions)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY is not configured');
  }

  try {
    const response = await fetch(MISTRAL_EMBED_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MISTRAL_EMBED_MODEL,
        input: [text],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Mistral Embed API error: ${response.status} - ${errorText}`
      );
    }

    const data: EmbeddingResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      throw new Error('No embedding returned from Mistral Embed API');
    }

    return data.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Search for similar articles in the database using vector similarity
 * @param query - The search query text
 * @param limit - Maximum number of results to return (default: 5)
 * @param matchThreshold - Minimum similarity threshold (default: 0.5)
 * @returns Array of similar articles with similarity scores
 */
export async function searchSimilarArticles(
  query: string,
  limit: number = 5,
  matchThreshold: number = 0.5
): Promise<SimilarArticle[]> {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Search for similar articles using the database function
    const { data, error } = await supabaseServer.rpc('search_similar_articles', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: limit,
    });

    if (error) {
      console.error('Error searching similar articles:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in searchSimilarArticles:', error);
    throw error;
  }
}

/**
 * Generate embeddings for a batch of texts (for bulk operations)
 * @param texts - Array of texts to embed
 * @returns Array of embedding vectors
 */
export async function generateBatchEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const apiKey = process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY is not configured');
  }

  // Mistral API supports batch embeddings (up to a reasonable limit)
  // We'll batch them in groups of 10 to avoid rate limits
  const batchSize = 10;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    try {
      const response = await fetch(MISTRAL_EMBED_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MISTRAL_EMBED_MODEL,
          input: batch,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Mistral Embed API error: ${response.status} - ${errorText}`
        );
      }

      const data: EmbeddingResponse = await response.json();

      // Add the embeddings in the correct order
      const batchEmbeddings = data.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);

      results.push(...batchEmbeddings);

      // Add a small delay to avoid rate limiting
      if (i + batchSize < texts.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`Error generating batch embeddings for batch ${i}:`, error);
      throw error;
    }
  }

  return results;
}

/**
 * Format similar articles for inclusion in the system prompt
 * @param articles - Array of similar articles
 * @returns Formatted string for the prompt
 */
export function formatArticlesForPrompt(articles: SimilarArticle[]): string {
  if (articles.length === 0) {
    return '';
  }

  const formattedArticles = articles
    .map((article, index) => {
      const title = article.title ? ` - ${article.title}` : '';
      const category = article.category ? ` (${article.category})` : '';
      return `${index + 1}. Article ${article.article_number}${title}${category}
   Contenu : ${article.content}
   Pertinence : ${(article.similarity * 100).toFixed(1)}%`;
    })
    .join('\n\n');

  return `ARTICLES JURIDIQUES PERTINENTS À UTILISER :

Les articles suivants ont été identifiés comme pertinents pour cette question. Tu DOIS les utiliser et les citer dans ta réponse :

${formattedArticles}

IMPORTANT : Cite ces articles de manière précise en utilisant le format "Article [numéro] du Code civil". Explique leur application au cas présent.`;
}
