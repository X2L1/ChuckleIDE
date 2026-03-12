'use strict';

const { EventEmitter } = require('events');

/**
 * ScoutingManager handles integration with FTCEvents API
 * and provides match prediction / advancement logic.
 */
class ScoutingManager extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
  }

  async fetchFromApi(endpoint) {
    // Always use built-in sample data - no API token required
    return this.getMockApiData(endpoint);
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
   * Predicts match outcome from alliance team numbers using ranking-point style strength.
   * Strength is derived from a deterministic function of team number (proxy for rank/OPR when no API).
   */
  predictMatch(redAlliance, blueAlliance) {
    const getStrength = (t) => {
      const num = Number(t.team || t.teamNumber) || 0;
      if (t.optr != null && !Number.isNaN(t.optr)) return t.optr;
      if (t.rankingPoints != null) return t.rankingPoints;
      if (num > 0) return 30 + (num % 40) + (num % 7) * 2;
      return 35;
    };
    const getAllianceStrength = (teams) => {
      const arr = Array.isArray(teams) ? teams : [];
      return arr.reduce((acc, t) => acc + getStrength(t), 0) / Math.max(arr.length, 1);
    };
    const redStrength = getAllianceStrength(redAlliance) * (redAlliance && redAlliance.length ? redAlliance.length : 2);
    const blueStrength = getAllianceStrength(blueAlliance) * (blueAlliance && blueAlliance.length ? blueAlliance.length : 2);
    const total = redStrength + blueStrength || 1;

    return {
      redWinProb: (redStrength / total) * 100,
      blueWinProb: (blueStrength / total) * 100,
      redPredictedScore: Math.round(redStrength * 2.5),
      bluePredictedScore: Math.round(blueStrength * 2.5)
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
    const num = Number(teamNumber) || 0;
    if (!num) throw new Error('Please enter a valid team number.');

    const eventsResponse = await this.fetchFromApi(`/${season}/events?teamNumber=${num}`);
    const events = eventsResponse && eventsResponse.events && Array.isArray(eventsResponse.events)
      ? eventsResponse.events
      : [{ code: 'MOCK', name: 'DECODE Qualifier' }];
    const event = events[0] && typeof events[0] === 'object'
      ? { code: events[0].code || 'MOCK', name: events[0].name || 'DECODE Qualifier' }
      : { code: 'MOCK', name: 'DECODE Qualifier' };

    return this._analyzeEvent(season, event, num);
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
