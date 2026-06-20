// Automated validation script for IPTV app proxy API
import axios from 'axios';

async function runTests() {
  console.log('=== Starting IPTV Proxy Verification Suite ===');
  const mac = '00:1A:79:7D:CD:70';
  const portalUrl = 'http://mock.iptv';

  try {
    // Test 1: Connect (Handshake)
    console.log('\n[Test 1] Testing /api/connect with mock portal...');
    const connectRes = await axios.post('http://localhost:5000/api/connect', {
      portalUrl,
      mac
    });
    
    if (connectRes.status === 200 && connectRes.data.token) {
      console.log('✓ Connect successful! Token received:', connectRes.data.token);
    } else {
      throw new Error('Failed /api/connect request');
    }

    // Test 2: Fetch Live TV Genres
    console.log('\n[Test 2] Testing /api/genres...');
    const genresRes = await axios.get(`http://localhost:5000/api/genres?mac=${mac}`);
    if (genresRes.status === 200 && Array.isArray(genresRes.data.js)) {
      console.log(`✓ Genres loaded successfully! Count: ${genresRes.data.js.length}`);
      console.log('Genres found:', genresRes.data.js.map(g => g.title).join(', '));
    } else {
      throw new Error('Failed /api/genres request');
    }

    // Test 3: Fetch Live Channels
    console.log('\n[Test 3] Testing /api/channels...');
    const channelsRes = await axios.get(`http://localhost:5000/api/channels?mac=${mac}&genre=all`);
    const channelItems = channelsRes.data.js?.data || [];
    if (channelsRes.status === 200 && channelItems.length > 0) {
      console.log(`✓ Channels loaded successfully! Count: ${channelItems.length}`);
      console.log('First channel details:', JSON.stringify(channelItems[0]));
    } else {
      throw new Error('Failed /api/channels request');
    }

    // Test 4: Fetch VOD Movies
    console.log('\n[Test 4] Testing /api/vod/movies...');
    const moviesRes = await axios.get(`http://localhost:5000/api/vod/movies?mac=${mac}&category=all`);
    const movieItems = moviesRes.data.js?.data || [];
    if (moviesRes.status === 200 && movieItems.length > 0) {
      console.log(`✓ Movies loaded successfully! Count: ${movieItems.length}`);
    } else {
      throw new Error('Failed /api/vod/movies request');
    }

    // Test 5: Resolve Stream Link
    console.log('\n[Test 5] Testing /api/create_link for custom stream ID...');
    const firstChan = channelItems[0];
    const linkRes = await axios.post('http://localhost:5000/api/create_link', {
      mac,
      cmd: firstChan.cmd,
      type: 'itv'
    });

    const resolvedUrl = linkRes.data.js?.cmd || '';
    if (linkRes.status === 200 && resolvedUrl) {
      console.log('✓ Stream link resolved successfully!');
      console.log('Resolved Stream URL:', resolvedUrl);
      
      // Check if it matches the expected user structure:
      // http://procdnnet.eu:80/play/live.php?mac=00:1A:79:7D:CD:70&stream=1294764&extension=ts&play_token=SiLuLzo3o5
      if (resolvedUrl.includes('play/live.php') && resolvedUrl.includes('mac=') && resolvedUrl.includes('stream=')) {
        console.log('✓ Resolved link matches user structure perfectly!');
      } else {
        console.warn('⚠️ Warning: Stream structure format differs from requested.');
      }
    } else {
      throw new Error('Failed /api/create_link request');
    }

    // Test 6: TV Series seasons
    console.log('\n[Test 6] Testing /api/series/seasons...');
    const seasonsRes = await axios.get(`http://localhost:5000/api/series/seasons?mac=${mac}&seriesId=301`);
    if (seasonsRes.status === 200 && Array.isArray(seasonsRes.data.js)) {
      console.log(`✓ Series seasons loaded successfully! Count: ${seasonsRes.data.js.length}`);
      console.log('Seasons found:', seasonsRes.data.js.map(s => s.name).join(', '));
    } else {
      throw new Error('Failed /api/series/seasons request');
    }

    // Test 7: TV Series episodes
    console.log('\n[Test 7] Testing /api/series/episodes for specific season...');
    const episodesRes = await axios.get(`http://localhost:5000/api/series/episodes?mac=${mac}&seriesId=301&seasonId=1`);
    const epItems = episodesRes.data.js?.data || [];
    if (episodesRes.status === 200 && epItems.length > 0) {
      console.log(`✓ Series episodes loaded successfully! Count: ${epItems.length}`);
      console.log('First episode:', epItems[0].name);
    } else {
      throw new Error('Failed /api/series/episodes request');
    }

    console.log('\n=== Verification completed: ALL TESTS PASSED SUCCESSFULLY! ===');
  } catch (err) {
    console.error('\n❌ Verification Failed:', err.message);
    if (err.response) {
      console.error('Response data:', err.response.data);
    }
    process.exit(1);
  }
}

runTests();
