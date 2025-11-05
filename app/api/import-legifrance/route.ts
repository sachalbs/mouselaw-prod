import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, createServerClient } from '@/lib/supabase/server';
import { fetchCodeCivilArticles, testLegiFranceConnection } from '@/lib/legifrance/client';

/**
 * POST /api/import-legifrance
 *
 * Import all Code civil articles from Légifrance API
 *
 * Query params:
 * - test=true : Test connection only, don't import
 * - replace=true : Replace existing articles (default: skip duplicates)
 *
 * IMPORTANT: This can take several minutes for the full Code civil (~2500 articles)
 * SECURITY: Protected route - requires authentication
 * TODO: Add admin role check for production
 */
export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const isTest = searchParams.get('test') === 'true';
  const shouldReplace = searchParams.get('replace') === 'true';

  try {
    // 🔒 SECURITY: Verify authentication
    const supabase = await createServerClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      console.error('🔒 [AUTH] Unauthorized access attempt to /api/import-legifrance');
      return NextResponse.json(
        { error: 'Non authentifié. Cette route nécessite une authentification.' },
        { status: 401 }
      );
    }

    console.log(`🔒 [AUTH] User ${session.user.email} accessing admin route /api/import-legifrance`);

    // TODO: Add admin role check
    // const { data: profile } = await supabase
    //   .from('users_profiles')
    //   .select('role')
    //   .eq('id', session.user.id)
    //   .single();
    // if (profile?.role !== 'admin') {
    //   return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
    // }

    // Test mode - just verify connection
    if (isTest) {
      const isConnected = await testLegiFranceConnection();
      return NextResponse.json({
        success: isConnected,
        message: isConnected
          ? 'Successfully connected to Légifrance API'
          : 'Failed to connect to Légifrance API',
      });
    }

    console.log('Starting Code civil import from Légifrance...');

    // Fetch articles from Légifrance
    const articles = await fetchCodeCivilArticles((current, total, message) => {
      console.log(`Progress: ${current}/${total} - ${message}`);
    });

    if (articles.length === 0) {
      return NextResponse.json(
        {
          error: 'No articles found in Légifrance response',
          imported: 0,
        },
        { status: 500 }
      );
    }

    console.log(`Fetched ${articles.length} articles from Légifrance`);

    // Check for existing articles
    const { data: existingArticles } = await supabaseServer
      .from('code_civil_articles')
      .select('article_number');

    const existingNumbers = new Set(
      existingArticles?.map((a) => a.article_number) || []
    );

    // Filter out duplicates unless replace=true
    let articlesToInsert = articles;
    let skipped = 0;

    if (!shouldReplace) {
      articlesToInsert = articles.filter((article) => {
        if (existingNumbers.has(article.article_number)) {
          skipped++;
          return false;
        }
        return true;
      });
    }

    console.log(
      `Inserting ${articlesToInsert.length} articles (${skipped} skipped as duplicates)`
    );

    if (articlesToInsert.length === 0) {
      return NextResponse.json({
        message: 'All articles already exist in database',
        total_fetched: articles.length,
        already_exist: skipped,
        imported: 0,
      });
    }

    // Insert articles in batches of 100 to avoid timeouts
    const batchSize = 100;
    let imported = 0;
    let failed = 0;

    for (let i = 0; i < articlesToInsert.length; i += batchSize) {
      const batch = articlesToInsert.slice(i, i + batchSize);

      try {
        // If replace mode, use upsert
        if (shouldReplace) {
          const { error } = await supabaseServer
            .from('code_civil_articles')
            .upsert(
              batch.map((article) => ({
                article_number: article.article_number,
                content: article.content,
                title: article.title,
                category: article.category,
                code_name: 'Code civil',
                keywords: extractKeywords(article.content),
              })),
              {
                onConflict: 'article_number',
              }
            );

          if (error) {
            console.error(`Error upserting batch ${i / batchSize + 1}:`, error);
            failed += batch.length;
          } else {
            imported += batch.length;
          }
        } else {
          // Insert mode (skip duplicates)
          const { error } = await supabaseServer
            .from('code_civil_articles')
            .insert(
              batch.map((article) => ({
                article_number: article.article_number,
                content: article.content,
                title: article.title,
                category: article.category,
                code_name: 'Code civil',
                keywords: extractKeywords(article.content),
              }))
            );

          if (error) {
            console.error(`Error inserting batch ${i / batchSize + 1}:`, error);
            failed += batch.length;
          } else {
            imported += batch.length;
          }
        }

        // Log progress
        console.log(
          `Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
            articlesToInsert.length / batchSize
          )} (${imported} total)`
        );
      } catch (error) {
        console.error('Error inserting batch:', error);
        failed += batch.length;
      }
    }

    const response = {
      message: `Successfully imported ${imported} articles from Code civil`,
      total_fetched: articles.length,
      imported,
      skipped,
      failed,
      needs_embedding: imported, // These new articles need embeddings
    };

    console.log('Import complete:', response);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in import-legifrance route:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        {
          error: 'Failed to import from Légifrance',
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to import from Légifrance' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/import-legifrance
 *
 * Get import status and statistics
 * SECURITY: Protected route - requires authentication
 */
export async function GET() {
  try {
    // 🔒 SECURITY: Verify authentication
    const supabase = await createServerClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      console.error('🔒 [AUTH] Unauthorized access attempt to GET /api/import-legifrance');
      return NextResponse.json(
        { error: 'Non authentifié. Cette route nécessite une authentification.' },
        { status: 401 }
      );
    }

    console.log(`🔒 [AUTH] User ${session.user.email} checking import status`);

    // Count total articles
    const { count: totalCount, error: totalError } = await supabaseServer
      .from('code_civil_articles')
      .select('*', { count: 'exact', head: true });

    if (totalError) {
      throw totalError;
    }

    // Count articles with embeddings
    const { count: embeddedCount, error: embeddedError } = await supabaseServer
      .from('code_civil_articles')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    if (embeddedError) {
      throw embeddedError;
    }

    // Check API credentials
    const hasCredentials =
      !!process.env.LEGIFRANCE_CLIENT_ID &&
      !!process.env.LEGIFRANCE_CLIENT_SECRET;

    return NextResponse.json({
      total_articles: totalCount || 0,
      articles_with_embeddings: embeddedCount || 0,
      articles_without_embeddings: (totalCount || 0) - (embeddedCount || 0),
      api_configured: hasCredentials,
      ready_to_import: hasCredentials,
    });
  } catch (error) {
    console.error('Error in import-legifrance GET route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch import status' },
      { status: 500 }
    );
  }
}

/**
 * Extract keywords from article content for search
 */
function extractKeywords(content: string): string[] {
  const keywords: string[] = [];

  // Common legal terms to extract
  const legalTerms = [
    'responsabilité',
    'dommage',
    'contrat',
    'obligation',
    'propriété',
    'possession',
    'prescription',
    'nullité',
    'résolution',
    'faute',
    'négligence',
    'imprudence',
    'préjudice',
    'indemnisation',
    'réparation',
    'garantie',
    'servitude',
    'usufruit',
    'donation',
    'succession',
    'testament',
    'mariage',
    'divorce',
    'filiation',
    'adoption',
  ];

  const lowerContent = content.toLowerCase();

  for (const term of legalTerms) {
    if (lowerContent.includes(term)) {
      keywords.push(term);
    }
  }

  // Add first few meaningful words
  const words = content
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 5);

  keywords.push(...words.map((w) => w.toLowerCase()));

  return [...new Set(keywords)]; // Remove duplicates
}
