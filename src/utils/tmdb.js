const TMDB_API_KEY = '3c5280362e1670e80b29c828dcd86c4c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

/**
 * Searches TMDB for a movie or TV show.
 * @param {string} query Search term
 * @param {string} type 'movie' or 'tv'
 * @returns {Promise<Object|null>} The top match
 */
export const searchTMDB = async (query, type = 'movie', year = null) => {
  if (!query) return null;
  
  // Clean up the query (remove years in parenthesis, HD, etc.)
  let cleanQuery = query.replace(/\(\d{4}\)/g, '')
                        .replace(/(1080p|720p|4k|HD)/gi, '')
                        .trim();
  
  let url = `${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanQuery)}`;
  if (year) {
    if (type === 'movie') url += `&primary_release_year=${year}`;
    if (type === 'tv') url += `&first_air_date_year=${year}`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('TMDB Search Failed');
    const data = await res.json();
    return data.results && data.results.length > 0 ? data.results[0] : null;
  } catch (error) {
    console.error('TMDB Search Error:', error);
    return null;
  }
};

/**
 * Fetches rich details for a specific TMDB ID
 * @param {number} tmdbId 
 * @param {string} type 'movie' or 'tv'
 */
export const getTMDBDetails = async (tmdbId, type = 'movie') => {
  if (!tmdbId) return null;
  
  const url = `${TMDB_BASE_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits,videos,recommendations,similar`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('TMDB Details Failed');
    return await res.json();
  } catch (error) {
    console.error('TMDB Details Error:', error);
    return null;
  }
};

/**
 * Helper to construct image URLs
 */
export const getTMDBImageUrl = (path, size = 'w500') => {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};
