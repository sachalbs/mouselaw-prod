import { NextResponse } from 'next/server';
import { supabaseServer, createServerClient } from '@/lib/supabase/server';
import { generateBatchEmbeddings } from '@/lib/mistral/embeddings';

/**
 * POST /api/embed-articles
 *
 * Generate embeddings for all articles in the database.
 * This should be run once after adding the vector extension and when new articles are added.
 *
 * SECURITY: Protected route - requires authentication
 * TODO: Add admin role check for production
 */
export async function POST() {
  try {
    // 🔒 SECURITY: Verify authentication
    const supabase = await createServerClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      console.error('🔒 [AUTH] Unauthorized access attempt to /api/embed-articles');
      return NextResponse.json(
        { error: 'Non authentifié. Cette route nécessite une authentification.' },
        { status: 401 }
      );
    }

    console.log(`🔒 [AUTH] User ${session.user.email} accessing admin route /api/embed-articles`);

    // TODO: Add admin role check
    // const { data: profile } = await supabase
    //   .from('users_profiles')
    //   .select('role')
    //   .eq('id', session.user.id)
    //   .single();
    // if (profile?.role !== 'admin') {
    //   return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
    // }

    // Fetch all articles without embeddings
    const { data: articles, error: fetchError } = await supabaseServer
      .from('code_civil_articles')
      .select('id, article_number, content, title')
      .is('embedding', null)
      .order('article_number');

    if (fetchError) {
      console.error('Error fetching articles:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch articles' },
        { status: 500 }
      );
    }

    if (!articles || articles.length === 0) {
      return NextResponse.json({
        message: 'No articles need embedding',
        processed: 0,
      });
    }

    console.log(`Processing ${articles.length} articles for embedding...`);

    // Prepare texts for embedding
    // Combine article number, title, and content for better semantic search
    const textsToEmbed = articles.map((article) => {
      const title = article.title ? `${article.title}. ` : '';
      return `Article ${article.article_number} du Code civil. ${title}${article.content}`;
    });

    // Generate embeddings in batches
    console.log('Generating embeddings...');
    const embeddings = await generateBatchEmbeddings(textsToEmbed);

    console.log(`Generated ${embeddings.length} embeddings`);

    // Update articles with their embeddings
    const updatePromises = articles.map((article, index) => {
      return supabaseServer
        .from('code_civil_articles')
        .update({ embedding: embeddings[index] })
        .eq('id', article.id);
    });

    const results = await Promise.all(updatePromises);

    // Check for errors
    const errors = results.filter((result) => result.error);
    if (errors.length > 0) {
      console.error('Errors updating articles:', errors);
      return NextResponse.json(
        {
          error: 'Some articles failed to update',
          processed: results.length - errors.length,
          failed: errors.length,
        },
        { status: 500 }
      );
    }

    console.log(`Successfully embedded ${articles.length} articles`);

    return NextResponse.json({
      message: 'Successfully generated embeddings for all articles',
      processed: articles.length,
      details: articles.map((article) => ({
        article_number: article.article_number,
        title: article.title,
      })),
    });
  } catch (error) {
    console.error('Error in embed-articles route:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        {
          error: 'Failed to generate embeddings',
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate embeddings' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/embed-articles
 *
 * Get status of embeddings in the database
 * SECURITY: Protected route - requires authentication
 */
export async function GET() {
  try {
    // 🔒 SECURITY: Verify authentication
    const supabase = await createServerClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session) {
      console.error('🔒 [AUTH] Unauthorized access attempt to GET /api/embed-articles');
      return NextResponse.json(
        { error: 'Non authentifié. Cette route nécessite une authentification.' },
        { status: 401 }
      );
    }

    console.log(`🔒 [AUTH] User ${session.user.email} checking embedding status`);

    // Count total articles
    const { count: totalCount, error: totalError } = await supabaseServer
      .from('code_civil_articles')
      .select('*', { count: 'exact', head: true });

    if (totalError) {
      console.error('Error counting total articles:', totalError);
      return NextResponse.json(
        { error: 'Failed to fetch article count' },
        { status: 500 }
      );
    }

    // Count articles with embeddings
    const { count: embeddedCount, error: embeddedError } = await supabaseServer
      .from('code_civil_articles')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    if (embeddedError) {
      console.error('Error counting embedded articles:', embeddedError);
      return NextResponse.json(
        { error: 'Failed to fetch embedded article count' },
        { status: 500 }
      );
    }

    const needsEmbedding = (totalCount || 0) - (embeddedCount || 0);

    return NextResponse.json({
      total_articles: totalCount || 0,
      embedded_articles: embeddedCount || 0,
      needs_embedding: needsEmbedding,
      percentage_complete:
        totalCount && totalCount > 0
          ? ((embeddedCount || 0) / totalCount) * 100
          : 0,
      ready_for_search: needsEmbedding === 0,
    });
  } catch (error) {
    console.error('Error in embed-articles GET route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch embedding status' },
      { status: 500 }
    );
  }
}
