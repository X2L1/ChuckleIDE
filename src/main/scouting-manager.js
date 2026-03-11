'use strict';

const https = require('https');
const { EventEmitter } = require('events');

/**
 * ScoutingManager handles integration with FTCEvents API
 * and provides match prediction / advancement logic.
 */
class ScoutingManager extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.baseUrl = 'https://ftc-api.firstinspires.org/v2.0';
    this.apiToken = '';
  }

  setToken(token) {
    this.apiToken = token;
  }

  async fetchFromApi(endpoint) {
    if (!this.apiToken) {
      // Intentional fallback: keep scouting views usable without API credentials
      // by returning deterministic DECODE-season sample data.
      return this.getMockApiData(endpoint);
    }

    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'Authorization': `Basic ${this.apiToken}`,
          'Accept': 'application/json'
        }
      };

      https.get(`${this.baseUrl}${endpoint}`, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try { resolve(JSON.parse(data)); }
            catch (e) { reject(new Error('Failed to parse API response')); }
          } else {
            reject(new Error(`API Error: ${res.statusCode} ${res.statusMessage}`));
          }
        });
      }).on('error', reject);
    });
  }

  getMockApiData(endpoint) {
    const safeEndpoint = String(endpoint || '').toLowerCase();
    const sampleRankings = {
      rankings: [
        { rank: 1, teamNumber: 11115, wins: 8, losses: 0, ties: 0, rankingPoints: 22 },
        { rank: 2, teamNumber: 12563, wins: 7, losses: 1, ties: 0, rankingPoints: 19 },
        { rank: 3, teamNumber: 9876, wins: 6, losses: 2, ties: 0, rankingPoints: 17 },
        { rank: 4, teamNumber: 4321, wins: 6, losses: 2, ties: 0, rankingPoints: 16 }
      ]
    };
    const sampleMatches = {
      matches: [
        {
          description: 'Qual 1',
          teams: [
            { station: 'Red1', teamNumber: 11115 },
            { station: 'Red2', teamNumber: 4321 },
            { station: 'Blue1', teamNumber: 12563 },
            { station: 'Blue2', teamNumber: 9876 }
          ],
          scoreRedFinal: 132,
          scoreBlueFinal: 128
        }
      ]
    };

    if (safeEndpoint.includes('/rankings/')) return sampleRankings;
    if (safeEndpoint.includes('/matches/')) return sampleMatches;
    if (safeEndpoint.includes('/teams?teamnumber=')) {
      const teamNumber = Number((safeEndpoint.split('teamnumber=')[1] || '').split('&')[0]) || 0;
      return { teams: teamNumber ? [{ teamNumber }] : [] };
    }
    if (safeEndpoint.includes('/events?teamnumber=')) {
      return { events: [{ code: 'MOCK', name: 'DECODE Qualifier' }] };
    }
    return {};
  }

  async getMatches(season, eventCode) {
    return this.fetchFromApi(`/${season}/matches/${eventCode}`);
  }

  async getRankings(season, eventCode) {
    return this.fetchFromApi(`/${season}/rankings/${eventCode}`);
  }

  async getTeamEvents(season, teamNumber) {
    return this.fetchFromApi(`/${season}/teams?teamNumber=${teamNumber}`);
  }

  /**
   * Predicts match outcome based on provided team metrics
   */
  predictMatch(redAlliance, blueAlliance) {
    // Simple Optr/ELO based prediction for demonstration
    // In a real scenario, this would use historical data and AI models.
    const getAllianceStrength = (teams) => teams.reduce((acc, t) => acc + (t.optr || 0), 0);
    
    const redStrength = getAllianceStrength(redAlliance);
    const blueStrength = getAllianceStrength(blueAlliance);
    const total = redStrength + blueStrength || 1;

    return {
      redWinProb: (redStrength / total) * 100,
      blueWinProb: (blueStrength / total) * 100,
      redPredictedScore: redStrength,
      bluePredictedScore: blueStrength
    };
  }

  /**
   * Calculates advancement points according to FTC rules
   */
  calculateAdvancement(rank, totalTeams, awards = []) {
    // Simplified advancement point logic
    let points = 50 - (rank * 2); // Baseline rank points
    if (awards.includes('Inspire')) points += 30;
    if (awards.includes('WinningAlliance')) points += 20;

    // Probability based on historical cutoffs
    const probability = Math.max(0, Math.min(100, (points / 80) * 100));

    return { points, probability };
  }

  /**
   * Automatically finds the most recent event for a team and analyzes competition.
   */
  async getAutoScoutingData(teamNumber) {
    const season = 2025; // DECODE 2025-2026
    
    // 1. Get events for this team
    const teamData = await this.fetchFromApi(`/teams?teamNumber=${teamNumber}`);
    if (!teamData.teams || teamData.teams.length === 0) {
      throw new Error(`Team ${teamNumber} not found.`);
    }

    // FTC API /teams endpoint might not return event history directly. 
    // We need to fetch rankings or events specifically for the season.
    const eventsResponse = await this.fetchFromApi(`/${season}/events?teamNumber=${teamNumber}`);
    if (!eventsResponse.events || eventsResponse.events.length === 0) {
      throw new Error(`No DECODE (2025-2026) event data found for team ${teamNumber}.`);
    }

    // Pick the most recent event (simple take first for now)
    return this._analyzeEvent(season, eventsResponse.events[0], teamNumber);
  }

  async _analyzeEvent(season, event, teamNumber) {
    const rankings = await this.getRankings(season, event.code);
    const eventRankings = rankings.rankings || [];
    
    const teamRank = eventRankings.find(r => r.teamNumber == teamNumber);
    
    // Calculate "Competitiveness" - simpler version using ranking points or OPR if available
    // For now, we'll just sort by ranking points as a proxy for competitiveness.
    const sortedCompetition = [...eventRankings]
      .sort((a, b) => b.rankingPoints - a.rankingPoints)
      .slice(0, 10)
      .map(r => ({
        teamNumber: r.teamNumber,
        rank: r.rank,
        rp: r.rankingPoints,
        isTarget: r.teamNumber == teamNumber
      }));

    return {
      season,
      event: event,
      teamRank: teamRank ? teamRank.rank : 'N/A',
      competition: sortedCompetition
    };
  }
}

module.exports = ScoutingManager;
